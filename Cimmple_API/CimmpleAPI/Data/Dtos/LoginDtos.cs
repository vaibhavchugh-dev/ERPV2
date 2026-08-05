namespace CimmpleAPI.Data.Dtos
{
    public class LoginUserDto
    {
        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public string? Email { get; set; }
        public string? UserName { get; set; }
        public int TenantID { get; set; }
        public int User_UniqueID { get; set; }
        public string? Message { get; set; }
        public string? IsLocked { get; set; }
        public string? IsManualLocked { get; set; }
        public int LockDay { get; set; }
        public string? IsMerge { get; set; }
        public string? CurrentUtcTime { get; set; }
        public string? isLaborModule { get; set; }
        public string? mergeURL { get; set; }
        public string? unmergeURL { get; set; }
        public string? mergeToken { get; set; }
        public int rolId { get; set; }
        public string? roleName { get; set; }
        public string? FailMessage { get; set; }
        public bool ShowIncompleteSlideOut { get; set; }
        public string? PrimaryMethod { get; set; }
        public string? PrimaryContact { get; set; }
        public string? Phone1 { get; set; }
        public string? PwdChangeStatus { get; set; }
        public string? companyName { get; set; }
        public string? EmployeeType { get; set; }
    }

    public class LoginUserDto2
    {
        public string? Message { get; set; }
        public string? IsLocked { get; set; }
        public string? IsManualLocked { get; set; }
        public int User_UniqueID { get; set; }
        public int LockDay { get; set; }
    }

    public class LoginModel
    {
        public string? userName { get; set; }
        public string? password { get; set; }
        public string? tenantId { get; set; }
        public string? GUID { get; set; }
        public string? LoginHID { get; set; }
        public string? Nonce { get; set; }
        public string? token { get; set; }
        public string? Source { get; set; }
        public bool isFreshDeskRequest { get; set; }
    }

    public class ChangePasswordModel
    {
        public int userId { get; set; }
        public string? userName { get; set; }
        public string? password { get; set; }
    }

    public class ChangePasswordModelNew
    {
        public int userId { get; set; }
        public string? userName { get; set; }
        public string? oldpassword { get; set; }
        public string? password { get; set; }
    }

    public class ValidateUserStatus
    {
        public string RVal { get; set; } = "0";
        public string? Phone { get; set; }
        public string? Email { get; set; }
        public string? PrimaryContact { get; set; }
        public string? IsEmailBlock { get; set; }
        public string? IsPhoneBlock { get; set; }
        public string? IsSplPermission { get; set; }
        public string? DisplayEmail { get; set; }
        public string? DisplayPhone { get; set; }
        public string? PhoneStatus { get; set; }
    }

    public class JsonResponse
    {
        public int StatusCode { get; set; }
        public bool Success { get; set; }
        public string Message { get; set; }
        public object? Result { get; set; }

        public JsonResponse(int statusCode, bool success, string message, object? result = null)
        {
            StatusCode = statusCode;
            Success = success;
            Message = message;
            Result = result;
        }
    }
}
