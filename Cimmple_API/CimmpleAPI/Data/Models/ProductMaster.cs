using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    public class ProductMaster
    {
        [Key]
        public int Id { get; set; }
        public string? partno { get; set; }
        public string? partname { get; set; }
        public int tenantid { get; set; }
        public string? Unit { get; set; }
        public decimal UnitPrice { get; set; }
        public int? Noofday { get; set; }
        public string? pdescription { get; set; }
        public int? customerid { get; set; }

        /// <summary>
        /// How this finished part is sourced: Make (shop), Buy (vendor), or Both.
        /// </summary>
        [MaxLength(20)]
        public string? SourcingType { get; set; }

        public decimal? ReorderPoint { get; set; }

        public decimal? ReorderQuantity { get; set; }
    }

    public class PartBreakupSetup
    {
        [Key]
        public int id { get; set; }
        public int priceid { get; set; }
        public decimal? qty1 { get; set; }
        public decimal? qty2 { get; set; }
        public decimal? qty3 { get; set; }
        public decimal? qty4 { get; set; }
        public decimal? qty5 { get; set; }
        public int partId { get; set; }
        public int tenantId { get; set; }
    }
}







