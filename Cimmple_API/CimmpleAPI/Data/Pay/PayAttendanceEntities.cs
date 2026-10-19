using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Pay
{
    /// <summary>Minimal CimmplePay.Companies projection for punch dual-write.</summary>
    [Table("Companies", Schema = DbSchema.Pay)]
    public class PayCompany
    {
        [Key]
        public int Id { get; set; }
        public string? Name { get; set; }
        public string? State { get; set; }
        public int IntegrationMode { get; set; }
        public int? ErpTenantId { get; set; }
        public bool EnableTimeRounding { get; set; }
    }

    /// <summary>Minimal CimmplePay.Employees projection for punch dual-write.</summary>
    [Table("Employees", Schema = DbSchema.Pay)]
    public class PayEmployee
    {
        [Key]
        public int Id { get; set; }
        public int CompanyId { get; set; }
        public int? FlowUserUniqueId { get; set; }
    }

    /// <summary>Minimal CimmplePay.TimeEntries projection for punch dual-write.</summary>
    [Table("TimeEntries", Schema = DbSchema.Pay)]
    public class PayTimeEntry
    {
        [Key]
        public int Id { get; set; }
        public int EmployeeId { get; set; }
        public DateTime WorkDate { get; set; }
        public DateTime? ClockInTime { get; set; }
        public DateTime? ClockOutTime { get; set; }
        public DateTime? BreakStartTime { get; set; }
        public DateTime? BreakEndTime { get; set; }
        public decimal BreakDuration { get; set; }
        public decimal RegularHours { get; set; }
        public decimal OvertimeHours { get; set; }
        public int EntryMethod { get; set; }
        public int Status { get; set; }
        public string? LocationName { get; set; }
        public string? Notes { get; set; }
        public DateTime CreatedDate { get; set; }
        public DateTime? ModifiedDate { get; set; }
    }
}
