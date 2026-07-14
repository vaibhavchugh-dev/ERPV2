using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    public class PriceBreakdownMaster
    {
        [Key]
        public int Id { get; set; }
        public string ItemName { get; set; } = "";
        public int Srno { get; set; }
        public int Status { get; set; } // 1 = Active, 0 = Inactive
        public int Tenantid { get; set; }
    }
}

