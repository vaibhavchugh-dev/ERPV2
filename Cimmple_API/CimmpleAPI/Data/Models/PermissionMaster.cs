using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    public class PermissionMaster
    {
        [Key]
        public int PermissionId { get; set; }
        public string? PermissionName { get; set; }
        public string? DisplayPermissionName { get; set; }
        public int LevelInfo { get; set; }
        public int? OrderNo { get; set; }
        public string? Url { get; set; }
        public string? ReportGroup { get; set; }
        public int? reportid { get; set; }
        public string? ReportDescription { get; set; }
    }

    public class PermissionRole
    {
        [Key]
        public int Id { get; set; }
        public int RoleId { get; set; }
        public int PermissionId { get; set; }
        public int TenantId { get; set; }
    }
}







