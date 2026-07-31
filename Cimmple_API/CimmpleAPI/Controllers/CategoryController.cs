using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using System;
using System.Collections.Generic;
using System.Linq;

namespace CimmpleAPI.Controllers
{
    /// <summary>
    /// Generic categorisation service. Category types and their values are pure data, so
    /// administrators can introduce new classification axes without any code change.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [AllowAnonymous]
    public class CategoryController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;

        /// <summary>
        /// Starter set provisioned on demand for a tenant. Values are only seeded for the
        /// axes that are the same in every shop; the rest are left for the customer to fill.
        /// </summary>
        public static readonly (string Name, string Code, int DisplayOrder, string[] Values)[] DefaultCategoryTypes = new[]
        {
            ("Process", "PROCESS", 1, new[] { "Milling", "Turning", "Grinding", "Drilling", "Welding", "Assembly", "Finishing" }),
            ("Material", "MATERIAL", 2, new[] { "Aluminium", "Steel", "Stainless Steel", "Titanium", "Brass", "Plastic" }),
            ("Part Family", "PARTFAMILY", 3, new string[0]),
            ("Machine", "MACHINE", 4, new string[0]),
            ("Customer", "CUSTOMER", 5, new string[0]),
            ("Production Type", "PRODTYPE", 6, new[] { "Prototype", "Batch Production", "Mass Production", "One-Off" }),
            ("Inspection", "INSPECTION", 7, new[] { "First Article", "In-Process", "Final", "CMM" }),
            ("Complexity", "COMPLEXITY", 8, new[] { "Low", "Medium", "High" }),
            ("Product Line", "PRODUCTLINE", 9, new string[0])
        };

        public CategoryController(CimmpleDbContext context)
        {
            _context = context;
        }

        [HttpGet("GetCategoryTypes")]
        public IActionResult GetCategoryTypes([FromQuery] int tenantid, [FromQuery] bool includeValues = true)
        {
            try
            {
                var types = _context.CategoryType
                    .Where(t => t.Tenantid == tenantid)
                    .OrderBy(t => t.DisplayOrder)
                    .ThenBy(t => t.Name)
                    .ToList();

                var valuesByType = includeValues
                    ? _context.CategoryValue
                        .Where(v => v.Tenantid == tenantid)
                        .OrderBy(v => v.DisplayOrder)
                        .ThenBy(v => v.Name)
                        .ToList()
                        .GroupBy(v => v.CategoryTypeId)
                        .ToDictionary(g => g.Key, g => g.ToList())
                    : new Dictionary<int, List<CategoryValue>>();

                var usageCounts = _context.JobTemplateCategory
                    .Where(c => c.Tenantid == tenantid)
                    .GroupBy(c => c.CategoryValueId)
                    .Select(g => new { CategoryValueId = g.Key, Count = g.Count() })
                    .ToList()
                    .ToDictionary(g => g.CategoryValueId, g => g.Count);

                var result = types.Select(t => new
                {
                    id = t.Id,
                    code = t.Code ?? "",
                    name = t.Name ?? "",
                    description = t.Description ?? "",
                    displayOrder = t.DisplayOrder,
                    allowUserValues = t.AllowUserValues,
                    isSystem = t.IsSystem,
                    isActive = t.IsActive,
                    values = (valuesByType.ContainsKey(t.Id) ? valuesByType[t.Id] : new List<CategoryValue>())
                        .Select(v => new
                        {
                            id = v.Id,
                            categoryTypeId = v.CategoryTypeId,
                            categoryTypeName = t.Name ?? "",
                            code = v.Code ?? "",
                            name = v.Name ?? "",
                            description = v.Description ?? "",
                            displayOrder = v.DisplayOrder,
                            isSystem = v.IsSystem,
                            isActive = v.IsActive,
                            usageCount = usageCounts.ContainsKey(v.Id) ? usageCounts[v.Id] : 0
                        })
                        .ToList()
                })
                .ToList();

                return Ok(new { result });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        /// <summary>
        /// Provisions the starter category types for a tenant that has none. Safe to call
        /// repeatedly: existing types are left untouched and nothing is overwritten.
        /// </summary>
        [HttpPost("EnsureDefaultCategoryTypes")]
        public IActionResult EnsureDefaultCategoryTypes([FromBody] EnsureDefaultCategoryTypesReq request)
        {
            try
            {
                if (request == null || request.Tenantid <= 0)
                {
                    return BadRequest(new { error = "A valid tenant is required" });
                }

                var existingNames = _context.CategoryType
                    .Where(t => t.Tenantid == request.Tenantid)
                    .Select(t => t.Name)
                    .ToList()
                    .Where(n => !string.IsNullOrWhiteSpace(n))
                    .Select(n => n!.ToLower())
                    .ToHashSet();

                int typesCreated = 0;
                int valuesCreated = 0;

                foreach (var seed in DefaultCategoryTypes)
                {
                    if (existingNames.Contains(seed.Name.ToLower()))
                    {
                        continue;
                    }

                    var type = new CategoryType
                    {
                        Tenantid = request.Tenantid,
                        Name = seed.Name,
                        Code = seed.Code,
                        DisplayOrder = seed.DisplayOrder,
                        AllowUserValues = true,
                        IsSystem = true,
                        IsActive = true
                    };

                    foreach (var (valueName, index) in seed.Values.Select((v, i) => (v, i)))
                    {
                        type.Values.Add(new CategoryValue
                        {
                            Tenantid = request.Tenantid,
                            Name = valueName,
                            DisplayOrder = index + 1,
                            IsSystem = true,
                            IsActive = true
                        });
                        valuesCreated++;
                    }

                    _context.CategoryType.Add(type);
                    typesCreated++;
                }

                _context.SaveChanges();

                return Ok(new { result = new { typesCreated, valuesCreated } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpPost("SaveCategoryType")]
        public IActionResult SaveCategoryType([FromBody] CategoryTypeReq request)
        {
            try
            {
                if (request == null)
                {
                    return BadRequest(new { error = "Request is null" });
                }

                if (string.IsNullOrWhiteSpace(request.Name))
                {
                    return BadRequest(new { error = "Category Type Name is required" });
                }

                var name = request.Name.Trim();

                var nameExists = _context.CategoryType.Any(t =>
                    t.Tenantid == request.Tenantid &&
                    t.Id != request.Id &&
                    t.Name != null &&
                    t.Name.ToLower() == name.ToLower());

                if (nameExists)
                {
                    return BadRequest(new { error = $"Category Type '{name}' already exists" });
                }

                CategoryType type;

                if (request.Id > 0)
                {
                    type = _context.CategoryType
                        .FirstOrDefault(t => t.Id == request.Id && t.Tenantid == request.Tenantid);

                    if (type == null)
                    {
                        return NotFound(new { error = "Category Type not found" });
                    }
                }
                else
                {
                    var maxOrder = _context.CategoryType
                        .Where(t => t.Tenantid == request.Tenantid)
                        .Select(t => (int?)t.DisplayOrder)
                        .Max() ?? 0;

                    type = new CategoryType
                    {
                        Tenantid = request.Tenantid,
                        DisplayOrder = request.DisplayOrder > 0 ? request.DisplayOrder : maxOrder + 1
                    };
                    _context.CategoryType.Add(type);
                }

                type.Name = name;
                type.Code = request.Code?.Trim() ?? "";
                type.Description = request.Description?.Trim() ?? "";
                type.AllowUserValues = request.AllowUserValues;
                type.IsActive = request.IsActive;
                if (request.DisplayOrder > 0) type.DisplayOrder = request.DisplayOrder;

                _context.SaveChanges();

                return Ok(new { result = new { id = type.Id, message = "Category Type saved successfully" } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpDelete("DeleteCategoryType")]
        public IActionResult DeleteCategoryType([FromQuery] int categoryTypeId, [FromQuery] int tenantId)
        {
            try
            {
                var type = _context.CategoryType
                    .FirstOrDefault(t => t.Id == categoryTypeId && t.Tenantid == tenantId);

                if (type == null)
                {
                    return NotFound(new { error = "Category Type not found" });
                }

                if (type.IsSystem)
                {
                    return BadRequest(new { error = "Protected system category types cannot be deleted" });
                }

                var valueIds = _context.CategoryValue
                    .Where(v => v.CategoryTypeId == categoryTypeId)
                    .Select(v => v.Id)
                    .ToList();

                var inUse = _context.JobTemplateCategory.Count(c => valueIds.Contains(c.CategoryValueId));
                if (inUse > 0)
                {
                    return BadRequest(new { error = $"Cannot delete: {inUse} job template assignment(s) still use values from this category type" });
                }

                _context.CategoryValue.RemoveRange(
                    _context.CategoryValue.Where(v => v.CategoryTypeId == categoryTypeId));
                _context.CategoryType.Remove(type);
                _context.SaveChanges();

                return Ok(new { result = new { message = "Category Type deleted successfully" } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpGet("GetCategoryValues")]
        public IActionResult GetCategoryValues([FromQuery] int tenantid, [FromQuery] int? categoryTypeId, [FromQuery] string? search)
        {
            try
            {
                var query = _context.CategoryValue.Where(v => v.Tenantid == tenantid);

                if (categoryTypeId.HasValue && categoryTypeId.Value > 0)
                {
                    query = query.Where(v => v.CategoryTypeId == categoryTypeId.Value);
                }

                if (!string.IsNullOrWhiteSpace(search))
                {
                    var term = search.Trim().ToLower();
                    query = query.Where(v => v.Name != null && v.Name.ToLower().Contains(term));
                }

                var typeNames = _context.CategoryType
                    .Where(t => t.Tenantid == tenantid)
                    .Select(t => new { t.Id, t.Name })
                    .ToList()
                    .ToDictionary(t => t.Id, t => t.Name ?? "");

                var values = query
                    .OrderBy(v => v.DisplayOrder)
                    .ThenBy(v => v.Name)
                    .AsEnumerable()
                    .Select(v => new
                    {
                        id = v.Id,
                        categoryTypeId = v.CategoryTypeId,
                        categoryTypeName = typeNames.ContainsKey(v.CategoryTypeId) ? typeNames[v.CategoryTypeId] : "",
                        code = v.Code ?? "",
                        name = v.Name ?? "",
                        description = v.Description ?? "",
                        displayOrder = v.DisplayOrder,
                        isSystem = v.IsSystem,
                        isActive = v.IsActive
                    })
                    .ToList();

                return Ok(new { result = values });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpPost("SaveCategoryValue")]
        public IActionResult SaveCategoryValue([FromBody] CategoryValueReq request)
        {
            try
            {
                if (request == null)
                {
                    return BadRequest(new { error = "Request is null" });
                }

                if (string.IsNullOrWhiteSpace(request.Name))
                {
                    return BadRequest(new { error = "Category Name is required" });
                }

                if (request.CategoryTypeId <= 0)
                {
                    return BadRequest(new { error = "Category Type is required" });
                }

                var type = _context.CategoryType
                    .FirstOrDefault(t => t.Id == request.CategoryTypeId && t.Tenantid == request.Tenantid);

                if (type == null)
                {
                    return BadRequest(new { error = "Category Type not found" });
                }

                var name = request.Name.Trim();

                var existing = _context.CategoryValue.FirstOrDefault(v =>
                    v.CategoryTypeId == request.CategoryTypeId &&
                    v.Name != null &&
                    v.Name.ToLower() == name.ToLower());

                if (existing != null && existing.Id != request.Id)
                {
                    // Re-use rather than reject: the tag control creates values optimistically
                    // and a concurrent create of the same name should be idempotent.
                    return Ok(new { result = new { id = existing.Id, message = "Category already exists", existed = true } });
                }

                CategoryValue value;

                if (request.Id > 0)
                {
                    value = _context.CategoryValue
                        .FirstOrDefault(v => v.Id == request.Id && v.Tenantid == request.Tenantid);

                    if (value == null)
                    {
                        return NotFound(new { error = "Category not found" });
                    }
                }
                else
                {
                    if (!type.AllowUserValues)
                    {
                        return BadRequest(new { error = $"New values are not allowed for category type '{type.Name}'" });
                    }

                    var maxOrder = _context.CategoryValue
                        .Where(v => v.CategoryTypeId == request.CategoryTypeId)
                        .Select(v => (int?)v.DisplayOrder)
                        .Max() ?? 0;

                    value = new CategoryValue
                    {
                        Tenantid = request.Tenantid,
                        CategoryTypeId = request.CategoryTypeId,
                        DisplayOrder = request.DisplayOrder > 0 ? request.DisplayOrder : maxOrder + 1
                    };
                    _context.CategoryValue.Add(value);
                }

                value.CategoryTypeId = request.CategoryTypeId;
                value.Name = name;
                value.Code = request.Code?.Trim() ?? "";
                value.Description = request.Description?.Trim() ?? "";
                value.IsActive = request.IsActive;
                if (request.DisplayOrder > 0) value.DisplayOrder = request.DisplayOrder;

                _context.SaveChanges();

                return Ok(new { result = new { id = value.Id, message = "Category saved successfully", existed = false } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpDelete("DeleteCategoryValue")]
        public IActionResult DeleteCategoryValue([FromQuery] int categoryValueId, [FromQuery] int tenantId)
        {
            try
            {
                var value = _context.CategoryValue
                    .FirstOrDefault(v => v.Id == categoryValueId && v.Tenantid == tenantId);

                if (value == null)
                {
                    return NotFound(new { error = "Category not found" });
                }

                var inUse = _context.JobTemplateCategory.Count(c => c.CategoryValueId == categoryValueId);
                if (inUse > 0)
                {
                    return BadRequest(new { error = $"Cannot delete: {inUse} job template(s) are tagged with this category" });
                }

                _context.CategoryValue.Remove(value);
                _context.SaveChanges();

                return Ok(new { result = new { message = "Category deleted successfully" } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }
    }

    public class EnsureDefaultCategoryTypesReq
    {
        public int Tenantid { get; set; }
    }

    public class CategoryTypeReq
    {
        public int Id { get; set; }
        public int Tenantid { get; set; }
        public string Name { get; set; } = "";
        public string Code { get; set; } = "";
        public string Description { get; set; } = "";
        public int DisplayOrder { get; set; }
        public bool AllowUserValues { get; set; } = true;
        public bool IsActive { get; set; } = true;
    }

    public class CategoryValueReq
    {
        public int Id { get; set; }
        public int Tenantid { get; set; }
        public int CategoryTypeId { get; set; }
        public string Name { get; set; } = "";
        public string Code { get; set; } = "";
        public string Description { get; set; } = "";
        public int DisplayOrder { get; set; }
        public bool IsActive { get; set; } = true;
    }
}
