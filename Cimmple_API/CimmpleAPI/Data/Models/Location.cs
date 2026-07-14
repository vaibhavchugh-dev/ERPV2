using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    public class Location
    {
        [Key]
        public int LocationId { get; set; }
        public int TenantId { get; set; }
        public string Name { get; set; }
        public string Code { get; set; }
        public string Address { get; set; }
        public string Region { get; set; }
        public string city { get; set; }
        public string state { get; set; }
        public string zip { get; set; }
        public string email { get; set; }
        public string webaddress { get; set; }
        public string phone { get; set; }
        public string Country { get; set; }

        /// <summary>See <see cref="LocationKind"/> — business site (root) through bin.</summary>
        public int LocType { get; set; }

        /// <summary>When set, this row is storage under a parent (site, warehouse, etc.). Roots are business sites.</summary>
        [Column("ParentLocationId")]
        public int? ParentLocationId { get; set; }

        [ForeignKey("ParentLocationId")]
        public Location? Parent { get; set; }

        public ICollection<Location> Children { get; set; } = new List<Location>();
    }

    public class LogoAttachment
    {
        [Key]
        public int Id { get; set; }
        public int locationId { get; set; }
        public string Name { get; set; }
        public int size { get; set; }
        public int FileUniqueno { get; set; }
        public string UploadFile { get; set; }
        public int TenantID { get; set; }
        public string FileCode { get; set; }
        public string Pageno { get; set; }
        public int createdby { get; set; }
    }
}







