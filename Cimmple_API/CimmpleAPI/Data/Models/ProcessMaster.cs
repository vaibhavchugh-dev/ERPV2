using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    public class ProcessMaster
    {
        [Key]
        public int Id { get; set; }
        public string? ProcessName { get; set; }
        public int Srno { get; set; }
        public string? PDescription { get; set; }
        public int Tenantid { get; set; }
        public int? isFixed { get; set; }
        public int status { get; set; }
        public string? ledgercode { get; set; }
    }
}







