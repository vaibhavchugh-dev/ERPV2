using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Models.Punch;
using CimmpleAPI.Services;
using CimmpleAPI.Services.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class AttendanceController : ApiBaseController
    {
        private readonly CimmpleDbContext _db;
        private readonly FaceRecognitionService _faceRecognition;

        public AttendanceController(CimmpleDbContext db, FaceRecognitionService faceRecognition)
        {
            _db = db;
            _faceRecognition = faceRecognition;
        }

        [HttpGet("GetPunchBoard")]
        public async Task<IActionResult> GetPunchBoard()
        {
            var tenantId = GetTenantId();
            if (tenantId <= 0)
            {
                return BadRequest(new { message = "Tenant is required" });
            }

            var nowLocal = GetTenantLocalNow(tenantId);
            var startLocal = nowLocal.Date;
            var endLocal = startLocal.AddDays(1);
            var startUtc = ToUtc(tenantId, startLocal);
            var endUtc = ToUtc(tenantId, endLocal);

            var employees = await _db.UserDetails.AsNoTracking()
                .Where(u => u.TenantID == tenantId
                    && (u.VendorId == null || u.VendorId == 0)
                    && (u.Status == null || u.Status == "Active"))
                .Select(u => new
                {
                    u.User_UniqueID,
                    u.FirstName,
                    u.LastName,
                    u.Email,
                    u.UserName,
                    u.TenantID,
                    u.EmpCode,
                    u.Empid,
                    u.Role,
                    u.Password
                })
                .ToListAsync();

            var userIds = employees.Select(e => e.User_UniqueID).ToList();

            var roleIds = employees.Where(e => e.Role.HasValue).Select(e => e.Role!.Value).Distinct().ToList();
            var roles = await _db.UserRole.AsNoTracking()
                .Where(r => roleIds.Contains(r.RoleID))
                .ToDictionaryAsync(r => r.RoleID, r => r.RoleName ?? "");

            var faces = await _db.EmployeeFace.AsNoTracking()
                .Where(f => f.TenantId == tenantId && userIds.Contains(f.UserUniqueId))
                .ToDictionaryAsync(f => f.UserUniqueId);

            var todaysPunches = await _db.FaceAttendanceLog.AsNoTracking()
                .Where(p => p.TenantId == tenantId
                    && p.IsSuccess
                    && p.PunchTime >= startUtc
                    && p.PunchTime < endUtc
                    && userIds.Contains(p.UserUniqueId))
                .OrderBy(p => p.PunchTime)
                .ToListAsync();

            var punchesByUser = todaysPunches
                .GroupBy(p => p.UserUniqueId)
                .ToDictionary(g => g.Key, g => g.ToList());

            var users = employees.Select(u =>
            {
                punchesByUser.TryGetValue(u.User_UniqueID, out var logs);
                logs ??= new List<FaceAttendanceLog>();

                var lastIn = logs.LastOrDefault(p => string.Equals(p.Direction, "IN", StringComparison.OrdinalIgnoreCase));
                var lastOut = logs.LastOrDefault(p => string.Equals(p.Direction, "OUT", StringComparison.OrdinalIgnoreCase));
                var lastBreakOut = logs.LastOrDefault(p =>
                    string.Equals(p.Direction, "BREAK_OUT", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(p.Direction, "BREAKOUT", StringComparison.OrdinalIgnoreCase));
                var last = logs.LastOrDefault();

                var isOnBreak = last != null && (
                    string.Equals(last.Direction, "BREAK_OUT", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(last.Direction, "BREAKOUT", StringComparison.OrdinalIgnoreCase));
                var isPunchedInOnly = !isOnBreak && last != null
                    && string.Equals(last.Direction, "IN", StringComparison.OrdinalIgnoreCase);
                var isCompletedPunch = last != null
                    && string.Equals(last.Direction, "OUT", StringComparison.OrdinalIgnoreCase);
                var isNotPunched = last == null;

                faces.TryGetValue(u.User_UniqueID, out var face);
                var isProfile = face != null && (face.AzureFaceRegistered || face.AwsFaceRegistered);

                return new
                {
                    user_UniqueID = u.User_UniqueID,
                    userUniqueId = u.User_UniqueID,
                    firstName = u.FirstName ?? "",
                    lastName = u.LastName ?? "",
                    email = u.Email ?? "",
                    userName = u.UserName ?? "",
                    tenantID = u.TenantID,
                    empCode = u.EmpCode ?? "",
                    empid = u.Empid,
                    role = u.Role,
                    roleName = u.Role.HasValue && roles.TryGetValue(u.Role.Value, out var rn) ? rn : "",
                    todayPunchIn = lastIn?.PunchTime,
                    todayPunchOut = lastOut?.PunchTime,
                    todayBreakOut = lastBreakOut?.PunchTime,
                    isNotPunched = isNotPunched ? 1 : 0,
                    isPunchedInOnly = isPunchedInOnly ? 1 : 0,
                    isCompletedPunch = isCompletedPunch ? 1 : 0,
                    isOnBreak = isOnBreak ? 1 : 0,
                    status = last?.Direction,
                    lastPunchTime = last?.PunchTime,
                    lastPunchMode = last?.VerificationType,
                    isProfile,
                    hasPassword = !string.IsNullOrEmpty(u.Password)
                };
            }).ToList();

            return Ok(new { result = new { users, lastUpdated = DateTime.UtcNow } });
        }

        [HttpPost("PunchPasswordVerify")]
        public async Task<IActionResult> PunchPasswordVerify([FromBody] PunchPasswordRequest request)
        {
            var tenantId = GetTenantId();
            var operatorId = GetUserId() ?? 0;
            if (tenantId <= 0)
            {
                return BadRequest(new { success = false, message = "Tenant is required" });
            }

            if (string.IsNullOrWhiteSpace(request.Password))
            {
                return BadRequest(new { success = false, message = "Password is required" });
            }

            if (string.IsNullOrWhiteSpace(request.UserName) && request.UserUniqueId <= 0)
            {
                return BadRequest(new { success = false, message = "Employee is required" });
            }

            var employees = _db.UserDetails.Where(u =>
                u.TenantID == tenantId && (u.VendorId == null || u.VendorId == 0));

            UserDetail? employee;
            if (request.UserUniqueId > 0)
            {
                employee = await employees.FirstOrDefaultAsync(u => u.User_UniqueID == request.UserUniqueId);
            }
            else
            {
                employee = await employees.FirstOrDefaultAsync(u => u.UserName == request.UserName);
            }

            if (employee == null)
            {
                return Ok(new { result = new { success = false, message = "Employee not found" } });
            }

            if (!string.Equals(employee.Status, "Active", StringComparison.OrdinalIgnoreCase)
                && !string.IsNullOrWhiteSpace(employee.Status))
            {
                return Ok(new { result = new { success = false, message = "Employee is not active" } });
            }

            if (!PasswordHasher.Verify(request.Password, employee.Password, employee.PasswordSalt, out var needsUpgrade))
            {
                return Ok(new { result = new { success = false, message = "Password verification failed" } });
            }

            if (needsUpgrade)
            {
                await _authUpgrade(employee, request.Password);
            }

            if (!TryResolveLocationId(request.LocationId, out var locationId, out var forbid, 0))
            {
                return forbid!;
            }

            var direction = string.IsNullOrWhiteSpace(request.Direction)
                ? await GetNextDirectionAsync(tenantId, employee.User_UniqueID)
                : request.Direction.Trim().ToUpperInvariant();

            var log = new FaceAttendanceLog
            {
                TenantId = tenantId,
                UserUniqueId = employee.User_UniqueID,
                UserName = employee.UserName,
                LocationId = locationId,
                Direction = direction,
                PunchTime = DateTime.UtcNow,
                Confidence = 100,
                IsSuccess = true,
                FailureReason = "",
                AzurePersonId = "",
                ImageUrl = "",
                VerificationType = "PASSWORD",
                CreatedBy = operatorId
            };

            _db.FaceAttendanceLog.Add(log);
            await _db.SaveChangesAsync();

            return Ok(new
            {
                result = new
                {
                    success = true,
                    message = direction == "OUT" ? "Punch Out Successful" : "Punch In Successful",
                    verifyConfidence = 100
                }
            });
        }

        [HttpPost("Punch")]
        [RequestSizeLimit(10_000_000)]
        public async Task<IActionResult> Punch([FromForm] IFormFile? image, [FromForm] string? formField)
        {
            var tenantId = GetTenantId();
            var operatorId = GetUserId() ?? 0;
            if (tenantId <= 0)
            {
                return BadRequest(new { message = "Tenant is required" });
            }

            if (image == null || image.Length == 0)
            {
                return Ok(new { result = new { success = false, message = "A face photo is required to punch." } });
            }

            if (string.IsNullOrWhiteSpace(formField))
            {
                return Ok(new { result = new { success = false, message = "Punch details are required." } });
            }

            PunchImageRequest? request;
            try
            {
                request = JsonSerializer.Deserialize<PunchImageRequest>(formField, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
            }
            catch
            {
                return Ok(new { result = new { success = false, message = "Invalid punch payload." } });
            }

            if (request == null || request.UserUniqueId <= 0)
            {
                return Ok(new { result = new { success = false, message = "Select an employee before punching." } });
            }

            var employee = await _db.UserDetails
                .FirstOrDefaultAsync(u => u.User_UniqueID == request.UserUniqueId && u.TenantID == tenantId);
            if (employee == null)
            {
                return Ok(new { result = new { success = false, message = "Employee not found" } });
            }

            if (!_faceRecognition.IsConfigured)
            {
                return Ok(new
                {
                    result = new
                    {
                        success = false,
                        message = "Face punch is not configured. Enter your password on the kiosk to punch."
                    }
                });
            }

            var enrollment = await _db.EmployeeFace
                .FirstOrDefaultAsync(f => f.TenantId == tenantId
                    && f.UserUniqueId == employee.User_UniqueID
                    && f.AzureFaceRegistered
                    && !string.IsNullOrEmpty(f.AzurePersonId));

            if (enrollment == null)
            {
                return Ok(new
                {
                    result = new
                    {
                        success = false,
                        message = "This employee is not enrolled for face punch. Add a photo in Employee Master, or punch with password."
                    }
                });
            }

            byte[] imageBytes;
            await using (var buffer = new MemoryStream())
            {
                await image.CopyToAsync(buffer);
                imageBytes = buffer.ToArray();
            }

            var detect = await _faceRecognition.DetectAsync(imageBytes);
            if (!detect.ok)
            {
                await WriteFailedPunchAsync(tenantId, employee, request, operatorId, detect.message, enrollment.AzurePersonId);
                return Ok(new { result = new { success = false, message = detect.message } });
            }

            var verify = await _faceRecognition.VerifyAsync(detect.faceId, tenantId, enrollment.AzurePersonId!);
            var matched = verify.isIdentical && verify.confidence >= FaceRecognitionService.MatchThreshold;
            if (!matched)
            {
                await WriteFailedPunchAsync(
                    tenantId,
                    employee,
                    request,
                    operatorId,
                    "Face did not match this employee",
                    enrollment.AzurePersonId);
                return Ok(new
                {
                    result = new
                    {
                        success = false,
                        message = "Face did not match this employee. Try again or punch with password.",
                        faceMatchConfidence = verify.confidence,
                        confidence = verify.confidence * 100
                    }
                });
            }

            var locationId = request.LocationId ?? employee.DefaultLocationId ?? 0;
            var direction = string.IsNullOrWhiteSpace(request.Direction)
                ? await GetNextDirectionAsync(tenantId, employee.User_UniqueID)
                : request.Direction.Trim().ToUpperInvariant();

            _db.FaceAttendanceLog.Add(new FaceAttendanceLog
            {
                TenantId = tenantId,
                UserUniqueId = employee.User_UniqueID,
                UserName = employee.UserName,
                LocationId = locationId,
                Direction = direction,
                PunchTime = DateTime.UtcNow,
                Confidence = verify.confidence * 100,
                IsSuccess = true,
                FailureReason = "",
                AzurePersonId = enrollment.AzurePersonId,
                ImageUrl = "",
                VerificationType = "FACE",
                CreatedBy = operatorId
            });
            await _db.SaveChangesAsync();

            return Ok(new
            {
                result = new
                {
                    success = true,
                    message = direction == "OUT" ? "Punch Out Successful" : "Punch In Successful",
                    faceMatchConfidence = verify.confidence,
                    confidence = verify.confidence * 100
                }
            });
        }

        private async Task WriteFailedPunchAsync(
            int tenantId,
            UserDetail employee,
            PunchImageRequest request,
            int operatorId,
            string reason,
            string? azurePersonId)
        {
            _db.FaceAttendanceLog.Add(new FaceAttendanceLog
            {
                TenantId = tenantId,
                UserUniqueId = employee.User_UniqueID,
                UserName = employee.UserName,
                LocationId = request.LocationId ?? employee.DefaultLocationId ?? 0,
                Direction = request.Direction,
                PunchTime = DateTime.UtcNow,
                Confidence = 0,
                IsSuccess = false,
                FailureReason = reason,
                AzurePersonId = azurePersonId ?? "",
                ImageUrl = "",
                VerificationType = "FACE",
                CreatedBy = operatorId
            });
            await _db.SaveChangesAsync();
        }

        private async Task _authUpgrade(UserDetail employee, string password)
        {
            var (hash, salt) = PasswordHasher.HashPassword(password);
            employee.Password = hash;
            employee.PasswordSalt = salt;
            await _db.SaveChangesAsync();
        }

        private async Task<string> GetNextDirectionAsync(int tenantId, int userUniqueId)
        {
            var nowLocal = GetTenantLocalNow(tenantId);
            var startUtc = ToUtc(tenantId, nowLocal.Date);
            var endUtc = ToUtc(tenantId, nowLocal.Date.AddDays(1));

            var last = await _db.FaceAttendanceLog
                .Where(p => p.TenantId == tenantId
                    && p.UserUniqueId == userUniqueId
                    && p.IsSuccess
                    && p.PunchTime >= startUtc
                    && p.PunchTime < endUtc)
                .OrderByDescending(p => p.PunchTime)
                .FirstOrDefaultAsync();

            if (last == null)
            {
                return "IN";
            }

            return string.Equals(last.Direction, "IN", StringComparison.OrdinalIgnoreCase) ? "OUT" : "IN";
        }

        private DateTime GetTenantLocalNow(int tenantId)
        {
            var tz = GetTenantTimeZone(tenantId);
            return TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
        }

        private DateTime ToUtc(int tenantId, DateTime localUnspecified)
        {
            var tz = GetTenantTimeZone(tenantId);
            var unspecified = DateTime.SpecifyKind(localUnspecified, DateTimeKind.Unspecified);
            return TimeZoneInfo.ConvertTimeToUtc(unspecified, tz);
        }

        private TimeZoneInfo GetTenantTimeZone(int tenantId)
        {
            var id = _db.SystemSettings.AsNoTracking()
                .Where(s => s.TenantId == tenantId)
                .Select(s => s.Timezone)
                .FirstOrDefault();

            if (string.IsNullOrWhiteSpace(id))
            {
                id = _db.EntityMaster.AsNoTracking()
                    .Where(e => e.Tenantid == tenantId)
                    .Select(e => e.timezone ?? e.timezoneui)
                    .FirstOrDefault();
            }

            if (string.IsNullOrWhiteSpace(id))
            {
                return TimeZoneInfo.Utc;
            }

            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch (TimeZoneNotFoundException)
            {
                return TimeZoneInfo.Utc;
            }
        }
    }

    public class PunchPasswordRequest
    {
        public string? Direction { get; set; }
        public string Password { get; set; } = "";
        public string? UserName { get; set; }
        public int UserUniqueId { get; set; }
        public int? LocationId { get; set; }
    }

    public class PunchImageRequest
    {
        public int UserUniqueId { get; set; }
        public int? TenantId { get; set; }
        public int? LocationId { get; set; }
        public string? Direction { get; set; }
        public string? UserName { get; set; }
    }
}
