using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    public class WorkstationMaster
    {
        [Key]
        public int Id { get; set; }
        public string WorkstationName { get; set; }
        public int TenantId { get; set; }
        public bool IsActive { get; set; }
    }

    public class UserWorkstationMapping
    {
        [Key]
        public int Id { get; set; }
        public int WorkstationId { get; set; }
        public int UserId { get; set; }
        public int TenantId { get; set; }
    }
}







