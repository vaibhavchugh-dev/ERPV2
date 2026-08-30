using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models.Punch
{
    public class FaceAttendanceLog
    {
        [Key]
        public int Id { get; set; }
        public int TenantId { get; set; }
        public int UserUniqueId { get; set; }
        public string? UserName { get; set; }
        public int LocationId { get; set; }
        public string? Direction { get; set; }
        public DateTime PunchTime { get; set; }
        public double? Confidence { get; set; }
        public bool IsSuccess { get; set; }
        public string? FailureReason { get; set; }
        public string? AzurePersonId { get; set; }
        public string? ImageUrl { get; set; }
        public string? VerificationType { get; set; }
        public int CreatedBy { get; set; }
    }

    public class EmployeeFace
    {
        [Key]
        public int Id { get; set; }
        public int TenantId { get; set; }
        public int UserUniqueId { get; set; }
        public string? AzurePersonId { get; set; }
        public string? AzurePersistedFaceId { get; set; }
        public bool AzureFaceRegistered { get; set; }
        public DateTime? AzureFaceLastSync { get; set; }
        public string? AwsPersonId { get; set; }
        public bool AwsFaceRegistered { get; set; }
        public DateTime? AwsFaceLastSync { get; set; }
        public bool FaceApprovalPending { get; set; }
        public string? PendingImagePath { get; set; }
        public DateTime CreatedUtc { get; set; }
        public DateTime? UpdatedUtc { get; set; }
    }
}
