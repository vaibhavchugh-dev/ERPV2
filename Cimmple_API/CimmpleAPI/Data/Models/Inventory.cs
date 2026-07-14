using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    public class Inventory
    {
        [Key]
        public int product_id { get; set; }
        public string product_name { get; set; }
        public int category_id { get; set; }
        public int producttype_int { get; set; }
        public int quantity_in_stock { get; set; }
        public decimal price { get; set; }
        public int sizeid { get; set; }
        public string inventory_description { get; set; }
        public string status { get; set; }
        public int Tenantid { get; set; }
    }

    public class Category
    {
        [Key]
        public int category_id { get; set; }
        public string category_name { get; set; }
        public int Tenantid { get; set; }
    }

    public class ProductType
    {
        [Key]
        public int producttype_int { get; set; }
        public string producttype_name { get; set; }
        public int Tenantid { get; set; }
    }
}







