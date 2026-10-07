using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;

namespace CimmpleAPI.Services.Tenancy
{
    public static class CategoryDefaults
    {
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

        /// <summary>
        /// Provisions the starter category types a tenant does not have yet. Safe to call
        /// repeatedly: a starter type counts as existing when its code or its name is already
        /// used (so a renamed system type is not re-created), and nothing is overwritten.
        /// </summary>
        public static (int TypesCreated, int ValuesCreated) EnsureForTenant(CimmpleDbContext context, int tenantId)
        {
            var existingNames = context.CategoryType
                .Where(t => t.Tenantid == tenantId)
                .Select(t => t.Name)
                .ToList()
                .Where(n => !string.IsNullOrWhiteSpace(n))
                .Select(n => n!.ToLower())
                .ToHashSet();

            var existingCodes = context.CategoryType
                .Where(t => t.Tenantid == tenantId)
                .Select(t => t.Code)
                .ToList()
                .Where(c => !string.IsNullOrWhiteSpace(c))
                .Select(c => c!.Trim().ToLower())
                .ToHashSet();

            var typesCreated = 0;
            var valuesCreated = 0;

            foreach (var seed in DefaultCategoryTypes)
            {
                if (existingNames.Contains(seed.Name.ToLower()) || existingCodes.Contains(seed.Code.ToLower()))
                {
                    continue;
                }

                var type = new CategoryType
                {
                    Tenantid = tenantId,
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
                        Tenantid = tenantId,
                        Name = valueName,
                        DisplayOrder = index + 1,
                        IsSystem = true,
                        IsActive = true
                    });
                    valuesCreated++;
                }

                context.CategoryType.Add(type);
                typesCreated++;
            }

            if (typesCreated > 0)
            {
                context.SaveChanges();
            }

            return (typesCreated, valuesCreated);
        }
    }
}
