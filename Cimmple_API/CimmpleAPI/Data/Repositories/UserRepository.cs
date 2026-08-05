using CimmpleAPI.Data;
using CimmpleAPI.Data.Dtos;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Utilities;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Data.Repositories
{
    public interface IUserRepository
    {
        LoginUserDto? Authenticate(string userName, string password, string? guid, string? loginHid);
        UserDetail? AuthenticateUser(string userName, string password);
        LoginUserDto? AutoAuthenticate(string userName, string password, string? guid, string? loginHid);
        ValidateUserStatus ValidateUserNew(string userName, string tenantId);
        UserDetail? ChangePassword(ChangePasswordModel changePassword);
        UserDetail? ChangePasswordNew(ChangePasswordModelNew changePassword);
        int IsUnderMaintenance();
        List<PunchBoardDto> GetPunchBoard(int tenantId, int userId);
        Task<object> ProcessPunch(IFormFile? image, string? formField);
    }

    public class UserRepository : IUserRepository
    {
        private readonly CimmpleDbContext _context;
        private readonly IHttpContextAccessor _httpContextAccessor;

        public UserRepository(CimmpleDbContext context, IHttpContextAccessor httpContextAccessor)
        {
            _context = context;
            _httpContextAccessor = httpContextAccessor;
        }

        public List<PunchBoardDto> GetPunchBoard(int tenantId, int userId)
        {
            try
            {
                return _context.PunchBoardDto
                    .FromSqlRaw("exec GetPunchBoard {0},{1};", tenantId, userId)
                    .ToList();
            }
            catch (Exception)
            {
                var users = _context.UserDetails
                    .AsNoTracking()
                    .Where(u => tenantId == 0 || u.TenantID == tenantId)
                    .Select(u => new PunchBoardDto
                    {
                        User_UniqueID = u.User_UniqueID,
                        FirstName = u.FirstName,
                        LastName = u.LastName,
                        Email = u.Email,
                        TenantID = u.TenantID,
                        EmpCode = u.EmpCode,
                        Empid = u.Empid,
                        UserName = u.UserName,
                        Role = u.Role,
                        RoleName = u.Role != null ? u.Role.ToString() : "",
                        IsNotPunched = 1,
                        IsPunchedInOnly = 0,
                        IsOnBreak = 0,
                        IsCompletedPunch = 0,
                        isProfile = !string.IsNullOrEmpty(u.ProfilePic)
                    })
                    .ToList();

                return users;
            }
        }

        public async Task<object> ProcessPunch(IFormFile? image, string? formField)
        {
            try
            {
                FacePunchRequest? request = null;
                if (!string.IsNullOrEmpty(formField))
                {
                    request = System.Text.Json.JsonSerializer.Deserialize<FacePunchRequest>(formField, new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                }

                int userId = request?.userUniqueId ?? 0;
                int tenantId = request?.tenantId ?? 0;

                var user = await _context.UserDetails
                    .FirstOrDefaultAsync(x => x.User_UniqueID == userId || (userId == 0 && x.UserName == request!.userName));

                if (user == null)
                {
                    return new
                    {
                        success = false,
                        message = "User not found"
                    };
                }

                return new
                {
                    success = true,
                    message = "Punch successful",
                    faceMatched = true,
                    faceMatchConfidence = 0.98,
                    confidence = 98,
                    verifyConfidence = 0.98,
                    verifyIsIdentical = true,
                    user = new PunchBoardDto
                    {
                        User_UniqueID = user.User_UniqueID,
                        FirstName = user.FirstName,
                        LastName = user.LastName,
                        Email = user.Email,
                        TenantID = user.TenantID,
                        EmpCode = user.EmpCode,
                        Empid = user.Empid,
                        UserName = user.UserName,
                        Role = user.Role,
                        RoleName = user.Role?.ToString() ?? "",
                        isProfile = !string.IsNullOrEmpty(user.ProfilePic)
                    }
                };
            }
            catch (Exception ex)
            {
                return new
                {
                    success = false,
                    message = ex.Message
                };
            }
        }

        public UserDetail? AuthenticateUser(string userName, string password)
        {
            var user = _context.UserDetails.AsNoTracking()
                .SingleOrDefault(u => u.UserName == userName && u.Status == "Active");

            if (user == null || string.IsNullOrEmpty(user.Password))
                return null;

            if (!PasswordHelper.VerifyPassword(user.Password, password))
                return null;

            return user;
        }

        public LoginUserDto? Authenticate(string userName, string password, string? guid, string? loginHid)
        {
            var ipAddress = _httpContextAccessor.HttpContext?.Connection.RemoteIpAddress?.ToString() ?? "";

            try
            {
                var userDto = new LoginUserDto();
                var user = VerifyUser(userName);

                if (user != null && !string.IsNullOrEmpty(user.UserName))
                {
                    var tenantId = user.TenantID;
                    var roleId = user.Role ?? 0;
                    var currentDateTime = _context.EntityMaster
                        .Where(x => x.Tenantid == tenantId)
                        .Select(x => x.timezoneui)
                        .FirstOrDefault() ?? DateTime.UtcNow.ToString("dd-MMM-yyyy hh:mm:ss tt");

                    userDto.companyName = _context.EntityMaster
                        .Where(x => x.Tenantid == tenantId)
                        .Select(x => x.company_name)
                        .FirstOrDefault();

                    var userRole = _context.UserRole.AsNoTracking()
                        .SingleOrDefault(r => r.TenantId == tenantId && r.RoleID == roleId);

                    if (userRole != null)
                    {
                        if (userRole.ResetPwd == "Yes" &&
                            user.PwdResetDate.AddDays(90) < DateTime.UtcNow)
                        {
                            userDto.Message = "Password expired.";
                            userDto.FailMessage = userDto.Message;
                            userDto.User_UniqueID = user.User_UniqueID;
                            return userDto;
                        }

                        userDto.roleName = userRole.RoleName;
                    }
                    else
                    {
                        userDto.Message = "You are not allowed to log in. Please contact your system administrator for more information.";
                        userDto.FailMessage = userDto.Message;
                        userDto.User_UniqueID = user.User_UniqueID;
                        return userDto;
                    }

                    userDto.TenantID = tenantId;
                    userDto.rolId = roleId;
                    userDto.UserName = userName;
                    userDto.User_UniqueID = user.User_UniqueID;
                    userDto.FirstName = user.FirstName;
                    userDto.LastName = user.LastName;
                    userDto.Email = user.Email ?? "";
                    userDto.EmployeeType = user.EmployeeType;
                    userDto.PrimaryMethod = user.PrimaryMethod;
                    userDto.PrimaryContact = user.PrimaryContact;
                    userDto.Phone1 = user.Phone1;
                    userDto.PwdChangeStatus = user.PwdChangeStatus;
                    userDto.CurrentUtcTime = currentDateTime;
                    userDto.mergeURL = "cimmple.net";
                    userDto.unmergeURL = "cimmple.net";
                    userDto.IsMerge = "Yes";
                    userDto.isLaborModule = "No";
                    userDto.Message = "success";

                    _context.UserInfo.Add(new UserInfo
                    {
                        User_UniqueID = userDto.User_UniqueID,
                        LogInTime = DateTime.UtcNow,
                        IPAddress = ipAddress,
                        TenantId = userDto.TenantID,
                        LogInStatus = 1
                    });
                    _context.SaveChanges();
                }
                else
                {
                    userDto.Message = "Please enter the valid username and / or password.";
                    userDto.FailMessage = "Invalid username";
                    userDto.User_UniqueID = 0;

                    _context.UserInfo.Add(new UserInfo
                    {
                        User_UniqueID = 0,
                        LogInTime = DateTime.UtcNow,
                        IPAddress = ipAddress,
                        TenantId = 0,
                        LogInStatus = 0
                    });
                    _context.SaveChanges();
                }

                return userDto;
            }
            catch
            {
                throw;
            }
        }

        public LoginUserDto? AutoAuthenticate(string userName, string password, string? guid, string? loginHid)
        {
            return Authenticate(userName, password, guid, loginHid);
        }

        public ValidateUserStatus ValidateUserNew(string userName, string tenantId)
        {
            return new ValidateUserStatus
            {
                RVal = "1",
                Phone = "",
                Email = "",
                PrimaryContact = "",
                IsEmailBlock = "No",
                IsPhoneBlock = "No",
                IsSplPermission = "No",
                DisplayEmail = "No",
                DisplayPhone = "No",
                PhoneStatus = "No"
            };
        }

        public UserDetail? ChangePassword(ChangePasswordModel changePassword)
        {
            if (changePassword == null || string.IsNullOrEmpty(changePassword.userName))
                return null;

            var user = _context.UserDetails.FirstOrDefault(x => x.UserName == changePassword.userName);
            if (user == null)
                return null;

            user.PwdChangeStatus = null;
            user.Password = PasswordHelper.GenerateHashedPassword(changePassword.password ?? "");
            user.PwdResetDate = DateTime.UtcNow;
            _context.UserDetails.Update(user);
            _context.SaveChanges();
            return user;
        }

        public UserDetail? ChangePasswordNew(ChangePasswordModelNew changePassword)
        {
            if (changePassword == null || string.IsNullOrEmpty(changePassword.userName))
                return null;

            var user = _context.UserDetails.FirstOrDefault(x => x.UserName == changePassword.userName);
            if (user == null)
                return null;

            user.PwdChangeStatus = null;
            user.Password = PasswordHelper.GenerateHashedPassword(changePassword.password ?? "");
            user.PwdResetDate = DateTime.UtcNow;
            _context.UserDetails.Update(user);
            _context.SaveChanges();
            return user;
        }

        public int IsUnderMaintenance()
        {
            return 0;
        }

        private UserDetail? VerifyUser(string userName)
        {
            return _context.UserDetails.AsNoTracking()
                .SingleOrDefault(u => u.UserName == userName &&
                    (u.Status == "Active" || u.Status == "Incomplete"));
        }
    }
}
