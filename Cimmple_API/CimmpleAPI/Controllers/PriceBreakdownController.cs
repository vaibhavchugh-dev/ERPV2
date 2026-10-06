using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PriceBreakdownController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;

        public PriceBreakdownController(CimmpleDbContext context)
        {
            _context = context;
        }

        [HttpGet("GetPriceBreakdowns")]
        public IActionResult GetPriceBreakdowns([FromQuery] int tenantid)
        {
            try
            {
                var priceBreakdowns = _context.PriceBreakdownMaster
                    .Where(p => p.Tenantid == tenantid)
                    .OrderBy(p => p.Srno)
                    .Select(p => new
                    {
                        id = p.Id,
                        itemName = p.ItemName ?? "",
                        srno = p.Srno,
                        status = p.Status,
                        statusText = p.Status == 1 ? "Active" : "Inactive"
                    })
                    .ToList();

                return Ok(new { result = priceBreakdowns });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetPriceBreakdownById")]
        public IActionResult GetPriceBreakdownById([FromQuery] int priceBreakdownId, [FromQuery] int tenantId)
        {
            try
            {
                var priceBreakdown = _context.PriceBreakdownMaster
                    .Where(p => p.Id == priceBreakdownId && p.Tenantid == tenantId)
                    .FirstOrDefault();

                if (priceBreakdown == null)
                {
                    return NotFound(new { error = "Price Breakdown not found" });
                }

                var result = new
                {
                    id = priceBreakdown.Id,
                    itemName = priceBreakdown.ItemName ?? "",
                    srno = priceBreakdown.Srno,
                    status = priceBreakdown.Status,
                    statusText = priceBreakdown.Status == 1 ? "Active" : "Inactive",
                    tenantid = priceBreakdown.Tenantid
                };

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("SavePriceBreakdowns")]
        public IActionResult SavePriceBreakdowns([FromBody] List<PriceBreakdownMasterReq> request)
        {
            try
            {
                request ??= new List<PriceBreakdownMasterReq>();

                var tenantId = GetTenantId();
                if (tenantId <= 0)
                {
                    tenantId = request.FirstOrDefault()?.Tenantid ?? 0;
                }
                if (tenantId <= 0)
                {
                    return BadRequest(new { error = "Tenant ID is required" });
                }

                if (request.Any(r => r.Tenantid > 0 && r.Tenantid != tenantId))
                {
                    return BadRequest(new { error = "Tenant mismatch" });
                }

                // Get existing price breakdowns for this tenant
                var existingPriceBreakdowns = _context.PriceBreakdownMaster
                    .Where(p => p.Tenantid == tenantId)
                    .ToList();

                // Delete existing ones that are not in the request
                var requestIds = request.Where(r => r.Id > 0).Select(r => r.Id).ToList();
                var toDelete = existingPriceBreakdowns.Where(e => !requestIds.Contains(e.Id)).ToList();
                foreach (var item in toDelete)
                {
                    var usageCount = CountQuotationLinesUsingPriceBreakdown(tenantId, item.Id);
                    if (usageCount > 0)
                    {
                        var name = string.IsNullOrWhiteSpace(item.ItemName) ? "This item" : item.ItemName.Trim();
                        return BadRequest(new
                        {
                            error = $"{name} cannot be deleted because it is used on {usageCount} quotation line(s)."
                        });
                    }
                }
                _context.PriceBreakdownMaster.RemoveRange(toDelete);

                // Update or create price breakdowns
                foreach (var req in request)
                {
                    PriceBreakdownMaster priceBreakdown;

                    if (req.Id > 0)
                    {
                        // Update existing
                        priceBreakdown = existingPriceBreakdowns.FirstOrDefault(p => p.Id == req.Id);
                        if (priceBreakdown == null)
                        {
                            continue; // Skip if not found
                        }
                    }
                    else
                    {
                        // Create new
                        priceBreakdown = new PriceBreakdownMaster
                        {
                            Tenantid = tenantId,
                        };
                        _context.PriceBreakdownMaster.Add(priceBreakdown);
                    }

                    // Update fields
                    priceBreakdown.ItemName = req.ItemName ?? "";
                    priceBreakdown.Srno = req.Srno;
                    priceBreakdown.Status = req.Status == "Active" ? 1 : 0;
                }

                _context.SaveChanges();

                return Ok(new { result = new { message = "Price Breakdowns saved successfully" } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        private static readonly JsonSerializerOptions QuotationMatrixJsonOptions = new()
        {
            PropertyNameCaseInsensitive = true,
        };

        private int CountQuotationLinesUsingPriceBreakdown(int tenantId, int priceBreakdownId)
        {
            var jsonRows = _context.QuotationOrderDetails
                .AsNoTracking()
                .Where(d => d.Tenantid == tenantId && d.QuantityTiers != null && d.QuantityTiers != "")
                .Select(d => d.QuantityTiers!)
                .ToList();

            var count = 0;
            foreach (var json in jsonRows)
            {
                try
                {
                    var matrix = JsonSerializer.Deserialize<QuotationMatrixSnapshotDto>(json, QuotationMatrixJsonOptions);
                    if (matrix?.BreakdownPrices?.Any(bp => bp.PriceBreakdownId == priceBreakdownId) == true)
                    {
                        count++;
                    }
                }
                catch
                {
                    // ignore malformed JSON
                }
            }

            return count;
        }
    }

    internal class QuotationMatrixSnapshotDto
    {
        public List<QuotationMatrixBreakdownRefDto> BreakdownPrices { get; set; } = new();
    }

    internal class QuotationMatrixBreakdownRefDto
    {
        public int PriceBreakdownId { get; set; }
    }

    public class PriceBreakdownMasterReq
    {
        public int Id { get; set; }
        public int Tenantid { get; set; }
        public string ItemName { get; set; } = "";
        public int Srno { get; set; }
        public string Status { get; set; } = "Active";
    }
}

