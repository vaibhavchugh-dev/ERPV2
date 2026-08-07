using System;
using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    public class UserDetail
    {
        [Key]
        public int User_UniqueID { get; set; }
        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public string? Email { get; set; }
        public int TenantID { get; set; }
        public string? UserName { get; set; }
        public string? Password { get; set; }
        public string? Status { get; set; }
        public int? Role { get; set; }
        public DateTime PwdResetDate { get; set; }
        public string? Phone1 { get; set; }
        public string? EmployeeType { get; set; }
        public string? Date_of_hire { get; set; }
        public string? UserToken { get; set; }
        public string? PasswordSalt { get; set; }
        public string? PwdChangeStatus { get; set; }
        public string? ChangePassword { get; set; }
        public string? HID { get; set; }
        public string? PrimaryContact { get; set; }
        public string? Date_of_termination { get; set; }
        public string? Termination_Reason { get; set; }
        public string? ValidateStatus { get; set; }
        public string? DOB { get; set; }
        public string? SSN { get; set; }
        public string? ChangedBy { get; set; }
        public DateTime? CreateDate { get; set; }
        public int? IsSalesAgent { get; set; }
        public int? AllowPTO { get; set; }
        public int? AllowPerformance { get; set; }
        public int? AllowACATracking { get; set; }
        public int? AllowDeposit { get; set; }
        public string? BlockedPhone { get; set; }
        public int? SendWelcomeEmail { get; set; }
        public string? PwdType { get; set; }
        public string? PhoneUpdateStatus { get; set; }
        public string? Address { get; set; }
        public string? Phone2 { get; set; }
        public string? City { get; set; }
        public string? State { get; set; }
        public string? Zip { get; set; }
        public string? Street { get; set; }
        public string? PrimaryMethod { get; set; }
        public int? VendorId { get; set; }
        public string? ContractId { get; set; }
        public int? PaidByVendor { get; set; }
        public int? AllowContactorOverTime { get; set; }
        public string? SearchSSN { get; set; }
        public string? EmpCode { get; set; }
        public int? Empid { get; set; }

        /// <summary>Preferred active location after login.</summary>
        public int? DefaultLocationId { get; set; }

        /// <summary>When true, user may switch to any location in the tenant.</summary>
        public bool CanAccessAllLocations { get; set; }

        public int FailedLoginCount { get; set; }

        /// <summary>UTC time until which the account remains locked after failed attempts.</summary>
        public DateTime? LockoutEndUtc { get; set; }

        public string? ProfilePic { get; set; }
    }

    public class UserRole
    {
        [Key]
        public int RoleID { get; set; }
        public string? RoleName { get; set; }
        public int OrderNo { get; set; }
        public string? ResetPwd { get; set; }
        public int TenantId { get; set; }
        public string? RoleTag { get; set; }
    }

    public class UserInfo
    {
        [Key]
        public int UserID { get; set; }
        public int User_UniqueID { get; set; }
        public DateTime LogInTime { get; set; }
        public int LogInStatus { get; set; }
        public string IPAddress { get; set; }
        public int TenantId { get; set; }
    }

    public class UserLogin
    {
        [Key]
        public int id { get; set; }
        public string? username { get; set; }
        public DateTime logintime { get; set; }
        public int ipaddress { get; set; }
        public string? browser { get; set; }
    }

    public class UserMapping
    {
        [Key]
        public int Id { get; set; }
        public int userId { get; set; }
        public int locationId { get; set; }
    }

    public class FileInfor
    {
        public string ContainerName { get; set; } = "data";
        public string Dirname { get; set; } = "";
        public string UploadFileName { get; set; } = "";
        public int tenantID { get; set; }
        public string type { get; set; } = "";
        public int userUniqueno { get; set; }
    }

    public class FaceValidationResult
    {
        public bool IsValid { get; set; }
        public string Message { get; set; } = "";
        public string FaceId { get; set; } = "";
    }

    public class gcwConfig
    {
        [Key]
        public int id { get; set; }
        public string? KeyName { get; set; }
        public string? KeyValue { get; set; }
    }

    public class PunchBoardDto
    {
        [Key]
        public int User_UniqueID { get; set; }
        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public string? Email { get; set; }
        public int TenantID { get; set; }
        public string? EmpCode { get; set; }
        public int? Empid { get; set; }
        public string? UserName { get; set; }
        public int? Role { get; set; }
        public string? RoleName { get; set; }
        public int? noofusers { get; set; }
        public DateTime? TodayPunchIn { get; set; }
        public DateTime? TodayPunchOut { get; set; }
        public DateTime? TodayBreakIn { get; set; }
        public DateTime? TodayBreakOut { get; set; }
        public int IsPunchedInOnly { get; set; }
        public int IsNotPunched { get; set; }
        public int IsOnBreak { get; set; }
        public int IsCompletedPunch { get; set; }
        public bool isProfile { get; set; }
    }

    public class FacePunchRequest
    {
        public int tenantId { get; set; }
        public int locationId { get; set; }
        public int userUniqueId { get; set; }
        public string? userName { get; set; }
        public string? direction { get; set; }
    }

    public class PunchRequests
    {
        public IFormFile? image { get; set; }
        public string? formField { get; set; }
    }

    public class PunchLoginModel
    {
        public string? userName { get; set; }
        public string? password { get; set; }
        public string? direction { get; set; }
    }
}







