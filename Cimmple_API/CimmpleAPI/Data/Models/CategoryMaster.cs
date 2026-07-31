using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    /// <summary>
    /// A grouping of category values, e.g. "Material", "Part Family", "Machine".
    /// Administrators add new types at runtime; nothing in the code enumerates them.
    /// </summary>
    public class CategoryType
    {
        [Key]
        public int Id { get; set; }

        public int Tenantid { get; set; }

        [MaxLength(50)]
        public string? Code { get; set; }

        [MaxLength(100)]
        public string? Name { get; set; }

        [MaxLength(500)]
        public string? Description { get; set; }

        /// <summary>Controls the order the tag groups appear in on forms and filter panels.</summary>
        public int DisplayOrder { get; set; }

        /// <summary>
        /// When false, values may only be picked from the existing list; the tag control
        /// hides its "create new" affordance and the API rejects unknown names.
        /// </summary>
        public bool AllowUserValues { get; set; } = true;

        /// <summary>Seeded by the system. Cannot be deleted by users.</summary>
        public bool IsSystem { get; set; }

        public bool IsActive { get; set; } = true;

        public ICollection<CategoryValue> Values { get; set; } = new List<CategoryValue>();
    }

    /// <summary>
    /// A single taggable value inside a <see cref="CategoryType"/>, e.g. "Aluminium".
    /// Deliberately generic so any entity can be categorised against it in future.
    /// </summary>
    public class CategoryValue
    {
        [Key]
        public int Id { get; set; }

        public int Tenantid { get; set; }

        public int CategoryTypeId { get; set; }

        [MaxLength(50)]
        public string? Code { get; set; }

        [MaxLength(150)]
        public string? Name { get; set; }

        [MaxLength(500)]
        public string? Description { get; set; }

        public int DisplayOrder { get; set; }

        public bool IsSystem { get; set; }

        public bool IsActive { get; set; } = true;

        public CategoryType? CategoryType { get; set; }
    }
}
