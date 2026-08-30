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

                var lastIn = logs.FirstOrDefault(p => IsClockIn(p.Direction));
                var lastOut = logs.LastOrDefault(p => IsDayOut(p.Direction));
                var lastBreakOut = logs.LastOrDefault(p => IsBreakOut(p.Direction));
                var last = logs.LastOrDefault();

                var isOnBreak = last != null && IsBreakOut(last.Direction);
                var isPunchedInOnly = last != null && IsOnPremises(last.Direction);
                var isCompletedPunch = last != null && IsDayOut(last.Direction);
                var isNotPunched = last == null;
                var nextDirection = ResolveNextDirection(last?.Direction, nowLocal);

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
                    nextDirection,
                    nextDirectionLabel = GetDirectionLabel(nextDirection),
                    lastPunchTime = last?.PunchTime,
                    lastPunchMode = last?.VerificationType,
                    isProfile,
                    hasPassword = !string.IsNullOrEmpty(u.Password)
                };
            }).ToList();

            return Ok(new { result = new { users, lastUpdated = DateTime.UtcNow } });
        }

        [HttpGet("GetRegister")]
        public async Task<IActionResult> GetRegister(
            [FromQuery] string? from,
            [FromQuery] string? to,
            [FromQuery] int? employeeId,
            [FromQuery] bool includeNoPunch = false)
        {
            var tenantId = GetTenantId();
            if (tenantId <= 0)
            {
                return BadRequest(new { message = "Tenant is required" });
            }

            var todayLocal = GetTenantLocalNow(tenantId).Date;
            var fromLocal = ParseDay(from, todayLocal);
            var toLocal = ParseDay(to, todayLocal);
            if (toLocal < fromLocal)
            {
                return BadRequest(new { message = "End date must be on or after start date" });
            }

            if ((toLocal - fromLocal).TotalDays > 62)
            {
                return BadRequest(new { message = "Date range cannot exceed 62 days" });
            }

            var startUtc = ToUtc(tenantId, fromLocal);
            var endUtc = ToUtc(tenantId, toLocal.AddDays(1));

            var employeesQuery = _db.UserDetails.AsNoTracking()
                .Where(u => u.TenantID == tenantId
                    && (u.VendorId == null || u.VendorId == 0));

            if (employeeId.HasValue && employeeId.Value > 0)
            {
                employeesQuery = employeesQuery.Where(u => u.User_UniqueID == employeeId.Value);
            }

            var employees = await employeesQuery
                .Select(u => new
                {
                    u.User_UniqueID,
                    u.FirstName,
                    u.LastName,
                    u.EmpCode,
                    u.UserName,
                    u.Status,
                    u.DefaultLocationId
                })
                .ToListAsync();

            var userIds = employees.Select(e => e.User_UniqueID).ToList();

            var punches = await _db.FaceAttendanceLog.AsNoTracking()
                .Where(p => p.TenantId == tenantId
                    && p.IsSuccess
                    && p.PunchTime >= startUtc
                    && p.PunchTime < endUtc
                    && userIds.Contains(p.UserUniqueId))
                .OrderBy(p => p.PunchTime)
                .ToListAsync();

            var punchesByUser = punches
                .GroupBy(p => p.UserUniqueId)
                .ToDictionary(g => g.Key, g => g.ToList());

            var locationIds = punches.Select(p => p.LocationId)
                .Concat(employees.Where(e => e.DefaultLocationId.HasValue).Select(e => e.DefaultLocationId!.Value))
                .Where(id => id > 0)
                .Distinct()
                .ToList();

            var locationNames = await _db.Locations.AsNoTracking()
                .Where(l => l.TenantId == tenantId && locationIds.Contains(l.LocationId))
                .ToDictionaryAsync(l => l.LocationId, l => l.Name ?? l.Code ?? ("#" + l.LocationId));

            var rows = new List<object>();
            var nowLocal = GetTenantLocalNow(tenantId);

            foreach (var employee in employees)
            {
                punchesByUser.TryGetValue(employee.User_UniqueID, out var userPunches);
                userPunches ??= new List<FaceAttendanceLog>();

                for (var day = fromLocal; day <= toLocal; day = day.AddDays(1))
                {
                    var dayStartUtc = ToUtc(tenantId, day);
                    var dayEndUtc = ToUtc(tenantId, day.AddDays(1));
                    var dayLogs = userPunches
                        .Where(p => p.PunchTime >= dayStartUtc && p.PunchTime < dayEndUtc)
                        .OrderBy(p => p.PunchTime)
                        .ToList();

                    if (dayLogs.Count == 0 && !includeNoPunch)
                    {
                        continue;
                    }

                    if (dayLogs.Count == 0 && includeNoPunch
                        && !string.Equals(employee.Status, "Active", StringComparison.OrdinalIgnoreCase)
                        && !string.IsNullOrEmpty(employee.Status))
                    {
                        continue;
                    }

                    var firstIn = dayLogs.FirstOrDefault(p => IsClockIn(p.Direction));
                    var lastOut = dayLogs.LastOrDefault(p => IsDayOut(p.Direction));
                    var last = dayLogs.LastOrDefault();
                    var onPremises = last != null && IsOnPremises(last.Direction);
                    string status;
                    if (dayLogs.Count == 0)
                    {
                        status = "noPunch";
                    }
                    else if (last != null && IsDayOut(last.Direction))
                    {
                        status = "completed";
                    }
                    else if (last != null && IsBreakOut(last.Direction))
                    {
                        status = day < todayLocal ? "missingOut" : "onBreak";
                    }
                    else if (onPremises && day < todayLocal)
                    {
                        status = "missingOut";
                    }
                    else
                    {
                        status = "in";
                    }

                    var hours = SumWorkedHours(dayLogs, nowLocal, day == todayLocal, tenantId);
                    var locationId = last?.LocationId ?? employee.DefaultLocationId ?? 0;
                    locationNames.TryGetValue(locationId, out var locationName);

                    rows.Add(new
                    {
                        workDate = day.ToString("yyyy-MM-dd"),
                        userUniqueId = employee.User_UniqueID,
                        empCode = employee.EmpCode ?? "",
                        firstName = employee.FirstName ?? "",
                        lastName = employee.LastName ?? "",
                        userName = employee.UserName ?? "",
                        punchIn = firstIn?.PunchTime,
                        punchOut = lastOut?.PunchTime,
                        hours,
                        status,
                        lastMethod = last?.VerificationType ?? "",
                        locationName = locationName ?? "",
                        punchCount = dayLogs.Count
                    });
                }
            }

            return Ok(new { result = rows });
        }

        [HttpGet("GetPunchLog")]
        public async Task<IActionResult> GetPunchLog(
            [FromQuery] string? from,
            [FromQuery] string? to,
            [FromQuery] int? employeeId,
            [FromQuery] bool includeFailed = false)
        {
            var tenantId = GetTenantId();
            if (tenantId <= 0)
            {
                return BadRequest(new { message = "Tenant is required" });
            }

            var todayLocal = GetTenantLocalNow(tenantId).Date;
            var fromLocal = ParseDay(from, todayLocal);
            var toLocal = ParseDay(to, todayLocal);
            if (toLocal < fromLocal)
            {
                return BadRequest(new { message = "End date must be on or after start date" });
            }

            var startUtc = ToUtc(tenantId, fromLocal);
            var endUtc = ToUtc(tenantId, toLocal.AddDays(1));

            var query = _db.FaceAttendanceLog.AsNoTracking()
                .Where(p => p.TenantId == tenantId
                    && p.PunchTime >= startUtc
                    && p.PunchTime < endUtc);

            if (!includeFailed)
            {
                query = query.Where(p => p.IsSuccess);
            }

            if (employeeId.HasValue && employeeId.Value > 0)
            {
                query = query.Where(p => p.UserUniqueId == employeeId.Value);
            }

            var logs = await query.OrderBy(p => p.PunchTime).ToListAsync();
            var userIds = logs.Select(p => p.UserUniqueId).Distinct().ToList();
            var people = await _db.UserDetails.AsNoTracking()
                .Where(u => u.TenantID == tenantId && userIds.Contains(u.User_UniqueID))
                .ToDictionaryAsync(u => u.User_UniqueID);

            var rows = logs.Select(p =>
            {
                people.TryGetValue(p.UserUniqueId, out var user);
                return new
                {
                    id = p.Id,
                    punchTime = p.PunchTime,
                    userUniqueId = p.UserUniqueId,
                    empCode = user?.EmpCode ?? "",
                    firstName = user?.FirstName ?? "",
                    lastName = user?.LastName ?? "",
                    direction = p.Direction ?? "",
                    verificationType = p.VerificationType ?? "",
                    isSuccess = p.IsSuccess,
                    failureReason = p.FailureReason ?? "",
                    confidence = p.Confidence
                };
            }).ToList();

            return Ok(new { result = rows });
        }

        private double? SumWorkedHours(
            List<FaceAttendanceLog> dayLogs,
            DateTime nowLocal,
            bool isToday,
            int tenantId)
        {
            DateTime? openIn = null;
            var total = TimeSpan.Zero;

            foreach (var punch in dayLogs)
            {
                var local = ToLocal(tenantId, punch.PunchTime);
                if (IsOnPremises(punch.Direction))
                {
                    // Start (or resume) a work segment: IN / BREAK_IN
                    openIn = local;
                }
                else if ((IsBreakOut(punch.Direction) || IsDayOut(punch.Direction)) && openIn.HasValue)
                {
                    // Pause for break or end the day
                    if (local > openIn.Value)
                    {
                        total += local - openIn.Value;
                    }
                    openIn = null;
                }
            }

            // Still on premises (or returned from break): count through now for today
            if (openIn.HasValue && isToday && nowLocal > openIn.Value)
            {
                total += nowLocal - openIn.Value;
            }

            if (total <= TimeSpan.Zero)
            {
                return null;
            }

            return Math.Round(total.TotalHours, 2);
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

            var direction = await GetNextDirectionAsync(tenantId, employee.User_UniqueID);

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
                    message = GetSuccessMessage(direction),
                    direction,
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
            var direction = await GetNextDirectionAsync(tenantId, employee.User_UniqueID);

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
                    message = GetSuccessMessage(direction),
                    direction,
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

            return ResolveNextDirection(last?.Direction, nowLocal);
        }

        /// <summary>
        /// Multiple punches/day for breaks:
        /// - No punch → IN
        /// - On break (BREAK_OUT) → BREAK_IN
        /// - On premises (IN / BREAK_IN) before 5:00 PM local → BREAK_OUT
        /// - On premises at/after 5:00 PM local → OUT (end of day)
        /// - Already OUT → IN (another session the same day)
        /// </summary>
        private static string ResolveNextDirection(string? lastDirection, DateTime nowLocal)
        {
            if (string.IsNullOrWhiteSpace(lastDirection))
            {
                return "IN";
            }

            if (IsBreakOut(lastDirection))
            {
                return "BREAK_IN";
            }

            if (IsDayOut(lastDirection))
            {
                return "IN";
            }

            if (IsOnPremises(lastDirection) || IsClockIn(lastDirection))
            {
                return nowLocal.TimeOfDay < EndOfDayPunchTime
                    ? "BREAK_OUT"
                    : "OUT";
            }

            // Unknown legacy direction: treat like a toggle toward IN
            return "IN";
        }

        private static readonly TimeSpan EndOfDayPunchTime = TimeSpan.FromHours(17);

        private static bool IsClockIn(string? direction) =>
            string.Equals(direction, "IN", StringComparison.OrdinalIgnoreCase);

        private static bool IsBreakIn(string? direction) =>
            string.Equals(direction, "BREAK_IN", StringComparison.OrdinalIgnoreCase)
            || string.Equals(direction, "BREAKIN", StringComparison.OrdinalIgnoreCase);

        private static bool IsBreakOut(string? direction) =>
            string.Equals(direction, "BREAK_OUT", StringComparison.OrdinalIgnoreCase)
            || string.Equals(direction, "BREAKOUT", StringComparison.OrdinalIgnoreCase);

        private static bool IsDayOut(string? direction) =>
            string.Equals(direction, "OUT", StringComparison.OrdinalIgnoreCase);

        private static bool IsOnPremises(string? direction) =>
            IsClockIn(direction) || IsBreakIn(direction);

        private static string GetDirectionLabel(string direction) =>
            direction.ToUpperInvariant() switch
            {
                "IN" => "Punch In",
                "OUT" => "Punch Out",
                "BREAK_OUT" => "Break Out",
                "BREAKOUT" => "Break Out",
                "BREAK_IN" => "Break In",
                "BREAKIN" => "Break In",
                _ => direction
            };

        private static string GetSuccessMessage(string direction) =>
            direction.ToUpperInvariant() switch
            {
                "OUT" => "Punch Out Successful",
                "BREAK_OUT" => "Break Out Successful",
                "BREAKOUT" => "Break Out Successful",
                "BREAK_IN" => "Break In Successful",
                "BREAKIN" => "Break In Successful",
                _ => "Punch In Successful"
            };

        private DateTime GetTenantLocalNow(int tenantId)
        {
            var tz = GetTenantTimeZone(tenantId);
            return TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
        }

        private static DateTime ParseDay(string? value, DateTime fallback)
        {
            if (!string.IsNullOrWhiteSpace(value)
                && DateTime.TryParse(value, out var parsed))
            {
                return parsed.Date;
            }

            return fallback.Date;
        }

        private DateTime ToLocal(int tenantId, DateTime utc)
        {
            var tz = GetTenantTimeZone(tenantId);
            var asUtc = utc.Kind == DateTimeKind.Utc
                ? utc
                : DateTime.SpecifyKind(utc, DateTimeKind.Utc);
            return TimeZoneInfo.ConvertTimeFromUtc(asUtc, tz);
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
