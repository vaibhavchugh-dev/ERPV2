using System.Net.Http.Json;
using CimmpleAPI.Data.Pay;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CimmpleAPI.Services
{
    public interface ICimmplePayAttendanceSyncService
    {
        /// <summary>
        /// Mirrors a successful CimmplePunch log into CimmplePay TimeEntries.
        /// No-ops when sync is disabled, company is not LinkedToFlow, or employee is not linked.
        /// Never throws — punch board success must not depend on Pay.
        /// </summary>
        Task SyncSuccessfulPunchAsync(
            int tenantId,
            int flowUserUniqueId,
            string direction,
            DateTime punchTimeUtc,
            int faceAttendanceLogId,
            string? locationName = null,
            string? tenantTimeZoneId = null,
            CancellationToken cancellationToken = default);
    }

    public class CimmplePayAttendanceSyncService : ICimmplePayAttendanceSyncService
    {
        private const int IntegrationModeLinkedToFlow = 1;
        private const int EntryMethodClockInOut = 1;
        private const int StatusDraft = 0;

        private readonly PayDbContext _pay;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly CimmplePayAttendanceSyncOptions _options;
        private readonly ILogger<CimmplePayAttendanceSyncService> _logger;

        public CimmplePayAttendanceSyncService(
            PayDbContext pay,
            IHttpClientFactory httpClientFactory,
            IOptions<CimmplePayAttendanceSyncOptions> options,
            ILogger<CimmplePayAttendanceSyncService> logger)
        {
            _pay = pay;
            _httpClientFactory = httpClientFactory;
            _options = options.Value;
            _logger = logger;
        }

        public async Task SyncSuccessfulPunchAsync(
            int tenantId,
            int flowUserUniqueId,
            string direction,
            DateTime punchTimeUtc,
            int faceAttendanceLogId,
            string? locationName = null,
            string? tenantTimeZoneId = null,
            CancellationToken cancellationToken = default)
        {
            if (!_options.SyncAttendanceEnabled || tenantId <= 0 || flowUserUniqueId <= 0)
            {
                return;
            }

            try
            {
                if (!string.IsNullOrWhiteSpace(_options.BaseUrl) &&
                    !string.IsNullOrWhiteSpace(_options.IntegrationKey))
                {
                    await SyncViaHttpAsync(
                        tenantId,
                        flowUserUniqueId,
                        direction,
                        punchTimeUtc,
                        faceAttendanceLogId,
                        locationName,
                        cancellationToken);
                    return;
                }

                await SyncViaSharedDbAsync(
                    tenantId,
                    flowUserUniqueId,
                    direction,
                    punchTimeUtc,
                    faceAttendanceLogId,
                    locationName,
                    tenantTimeZoneId,
                    cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(
                    ex,
                    "CimmplePay attendance sync failed for tenant {TenantId} user {UserId} direction {Direction} log {LogId}",
                    tenantId,
                    flowUserUniqueId,
                    direction,
                    faceAttendanceLogId);
            }
        }

        private async Task SyncViaHttpAsync(
            int tenantId,
            int flowUserUniqueId,
            string direction,
            DateTime punchTimeUtc,
            int faceAttendanceLogId,
            string? locationName,
            CancellationToken cancellationToken)
        {
            var client = _httpClientFactory.CreateClient("CimmplePay");
            using var request = new HttpRequestMessage(
                HttpMethod.Post,
                "api/timeattendance/kiosk-punch");
            request.Headers.TryAddWithoutValidation("X-Cimmple-Integration-Key", _options.IntegrationKey);
            request.Content = JsonContent.Create(new
            {
                erpTenantId = tenantId,
                flowUserUniqueId,
                direction,
                punchTimeUtc,
                locationName,
                faceAttendanceLogId
            });

            using var response = await client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogWarning(
                    "CimmplePay kiosk-punch HTTP {Status}: {Body}",
                    (int)response.StatusCode,
                    body);
                return;
            }

            _logger.LogInformation(
                "Synced punch log {LogId} to CimmplePay via HTTP for tenant {TenantId} user {UserId}",
                faceAttendanceLogId,
                tenantId,
                flowUserUniqueId);
        }

        private async Task SyncViaSharedDbAsync(
            int tenantId,
            int flowUserUniqueId,
            string direction,
            DateTime punchTimeUtc,
            int faceAttendanceLogId,
            string? locationName,
            string? tenantTimeZoneId,
            CancellationToken cancellationToken)
        {
            var normalized = NormalizeDirection(direction);
            if (normalized == null)
            {
                _logger.LogDebug("Skipping Pay sync for unsupported direction {Direction}", direction);
                return;
            }

            var linked = await _pay.Employees
                .AsNoTracking()
                .Where(e => e.FlowUserUniqueId == flowUserUniqueId)
                .Join(
                    _pay.Companies.Where(c => c.ErpTenantId == tenantId),
                    e => e.CompanyId,
                    c => c.Id,
                    (e, c) => new { Employee = e, Company = c })
                .OrderByDescending(x => x.Company.IntegrationMode == IntegrationModeLinkedToFlow)
                .FirstOrDefaultAsync(cancellationToken);

            if (linked == null)
            {
                var hasCompany = await _pay.Companies
                    .AsNoTracking()
                    .AnyAsync(c => c.ErpTenantId == tenantId, cancellationToken);
                if (!hasCompany)
                {
                    _logger.LogInformation(
                        "No CimmplePay company with ErpTenantId {TenantId}; punch stays in FaceAttendanceLog only",
                        tenantId);
                }
                else
                {
                    _logger.LogWarning(
                        "No CimmplePay employee for Flow user {UserId} under ErpTenantId {TenantId}; sync from Flow or set FlowUserUniqueId",
                        flowUserUniqueId,
                        tenantId);
                }
                return;
            }

            var company = linked.Company;
            var employee = linked.Employee;

            var marker = $"FaceAttendanceLog:{faceAttendanceLogId}";
            var already = await _pay.TimeEntries
                .AsNoTracking()
                .AnyAsync(
                    te => te.EmployeeId == employee.Id &&
                          te.Notes != null &&
                          te.Notes.Contains(marker),
                    cancellationToken);
            if (already)
            {
                return;
            }

            var punchUtc = AsUtc(punchTimeUtc);

            var timeZone = ResolveTimeZone(tenantTimeZoneId, company.State);

            switch (normalized)
            {
                case "IN":
                    await ClockInSharedAsync(employee.Id, timeZone, punchUtc, locationName, marker, cancellationToken);
                    break;
                case "OUT":
                    await ClockOutSharedAsync(employee.Id, company, punchUtc, marker, cancellationToken);
                    break;
                case "BREAK_OUT":
                    await StartBreakSharedAsync(employee.Id, punchUtc, marker, cancellationToken);
                    break;
                case "BREAK_IN":
                    await EndBreakSharedAsync(employee.Id, punchUtc, marker, cancellationToken);
                    break;
            }

            _logger.LogInformation(
                "Synced punch log {LogId} to CimmplePay via shared DB ({Direction}) for employee {EmployeeId}",
                faceAttendanceLogId,
                normalized,
                employee.Id);
        }

        private async Task ClockInSharedAsync(
            int employeeId,
            TimeZoneInfo timeZone,
            DateTime punchUtc,
            string? locationName,
            string marker,
            CancellationToken cancellationToken)
        {
            var workDate = TimeZoneInfo.ConvertTimeFromUtc(punchUtc, timeZone).Date;
            var open = await GetOpenEntryAsync(employeeId, cancellationToken);
            if (open != null)
            {
                if (open.WorkDate.Date < workDate)
                {
                    AutoCloseStaleOpenSegment(open, punchUtc, timeZone);
                }
                else
                {
                    throw new InvalidOperationException(
                        $"Employee {employeeId} already has an open Pay segment {open.Id}.");
                }
            }

            _pay.TimeEntries.Add(new PayTimeEntry
            {
                EmployeeId = employeeId,
                WorkDate = workDate,
                ClockInTime = punchUtc,
                EntryMethod = EntryMethodClockInOut,
                Status = StatusDraft,
                LocationName = locationName,
                Notes = marker,
                CreatedDate = DateTime.UtcNow,
                RegularHours = 0,
                OvertimeHours = 0,
                BreakDuration = 0
            });
            await _pay.SaveChangesAsync(cancellationToken);
        }

        private static void AutoCloseStaleOpenSegment(
            PayTimeEntry open,
            DateTime newPunchUtc,
            TimeZoneInfo timeZone)
        {
            DateTime closeAt;
            if (open.BreakStartTime.HasValue && !open.BreakEndTime.HasValue)
            {
                closeAt = open.BreakStartTime.Value;
            }
            else
            {
                var localMidnightNext = DateTime.SpecifyKind(
                    open.WorkDate.Date.AddDays(1),
                    DateTimeKind.Unspecified);
                closeAt = TimeZoneInfo.ConvertTimeToUtc(localMidnightNext, timeZone);
            }

            if (closeAt > newPunchUtc)
            {
                closeAt = newPunchUtc.AddSeconds(-1);
            }

            if (!open.ClockInTime.HasValue || closeAt <= open.ClockInTime.Value)
            {
                closeAt = open.ClockInTime?.AddMinutes(1) ?? newPunchUtc;
            }

            FinalizeOpenBreakIfNeeded(open, closeAt);
            open.ClockOutTime = closeAt;
            CalculateHours(open, enableRounding: false);
            open.ModifiedDate = DateTime.UtcNow;
        }

        private async Task ClockOutSharedAsync(
            int employeeId,
            PayCompany company,
            DateTime punchUtc,
            string marker,
            CancellationToken cancellationToken)
        {
            var open = await GetOpenEntryAsync(employeeId, cancellationToken)
                ?? throw new InvalidOperationException($"No open Pay segment for employee {employeeId}.");

            if (open.ClockInTime.HasValue && punchUtc < open.ClockInTime.Value)
            {
                throw new InvalidOperationException("Clock-out time cannot be before clock-in time");
            }

            FinalizeOpenBreakIfNeeded(open, punchUtc);
            open.ClockOutTime = punchUtc;
            CalculateHours(open, company.EnableTimeRounding);
            AppendMarker(open, marker);
            open.ModifiedDate = DateTime.UtcNow;
            await _pay.SaveChangesAsync(cancellationToken);
        }

        private static void FinalizeOpenBreakIfNeeded(PayTimeEntry entry, DateTime closeUtc)
        {
            if (!entry.BreakStartTime.HasValue || entry.BreakEndTime.HasValue)
            {
                return;
            }

            var breakStart = entry.BreakStartTime.Value;
            var breakEnd = closeUtc < breakStart ? breakStart : closeUtc;
            entry.BreakEndTime = breakEnd;

            var minutes = (decimal)(breakEnd - breakStart).TotalMinutes;
            if (minutes > 0)
            {
                entry.BreakDuration += minutes;
            }
        }

        private async Task StartBreakSharedAsync(
            int employeeId,
            DateTime punchUtc,
            string marker,
            CancellationToken cancellationToken)
        {
            var open = await GetOpenEntryAsync(employeeId, cancellationToken)
                ?? throw new InvalidOperationException($"No open Pay segment for employee {employeeId}.");

            if (open.BreakStartTime.HasValue && !open.BreakEndTime.HasValue)
            {
                throw new InvalidOperationException("Break is already in progress");
            }

            open.BreakStartTime = punchUtc;
            open.BreakEndTime = null;
            // Match Attendance Register SumWorkedHours: pause counts as worked through BREAK_OUT.
            CalculateHours(open, enableRounding: false);
            AppendMarker(open, marker);
            open.ModifiedDate = DateTime.UtcNow;
            await _pay.SaveChangesAsync(cancellationToken);
        }

        private async Task EndBreakSharedAsync(
            int employeeId,
            DateTime punchUtc,
            string marker,
            CancellationToken cancellationToken)
        {
            var open = await GetOpenEntryAsync(employeeId, cancellationToken);
            if (open == null || !open.BreakStartTime.HasValue || open.BreakEndTime.HasValue)
            {
                throw new InvalidOperationException("No active break found");
            }

            open.BreakEndTime = punchUtc;
            open.BreakDuration += (decimal)(open.BreakEndTime.Value - open.BreakStartTime.Value).TotalMinutes;
            AppendMarker(open, marker);
            open.ModifiedDate = DateTime.UtcNow;
            await _pay.SaveChangesAsync(cancellationToken);
        }

        private async Task<PayTimeEntry?> GetOpenEntryAsync(int employeeId, CancellationToken cancellationToken)
        {
            return await _pay.TimeEntries
                .Where(te => te.EmployeeId == employeeId &&
                             te.ClockInTime != null &&
                             te.ClockOutTime == null)
                .OrderByDescending(te => te.ClockInTime)
                .ThenByDescending(te => te.Id)
                .FirstOrDefaultAsync(cancellationToken);
        }

        private static void AppendMarker(PayTimeEntry entry, string marker)
        {
            entry.Notes = string.IsNullOrWhiteSpace(entry.Notes)
                ? marker
                : $"{entry.Notes}\n{marker}";
        }

        private static void CalculateHours(PayTimeEntry entry, bool enableRounding)
        {
            if (!entry.ClockInTime.HasValue)
            {
                return;
            }

            DateTime? end = null;
            if (entry.ClockOutTime.HasValue)
            {
                end = entry.ClockOutTime.Value;
            }
            else if (entry.BreakStartTime.HasValue && !entry.BreakEndTime.HasValue)
            {
                end = entry.BreakStartTime.Value;
            }

            if (!end.HasValue || end.Value <= entry.ClockInTime.Value)
            {
                return;
            }

            var totalMinutes = (end.Value - entry.ClockInTime.Value).TotalMinutes;
            if (entry.BreakDuration > 0)
            {
                totalMinutes -= (double)entry.BreakDuration;
            }

            if (totalMinutes < 0)
            {
                totalMinutes = 0;
            }

            decimal totalHours;
            if (enableRounding)
            {
                var roundedMinutes = Math.Round(totalMinutes / 15.0) * 15.0;
                totalHours = (decimal)(roundedMinutes / 60.0);
            }
            else
            {
                totalHours = (decimal)(totalMinutes / 60.0);
            }

            entry.RegularHours = Math.Round(totalHours, 2);
            entry.OvertimeHours = 0;
        }

        private static string? NormalizeDirection(string? direction)
        {
            if (string.IsNullOrWhiteSpace(direction))
            {
                return null;
            }

            var normalized = direction.Trim().ToUpperInvariant().Replace('-', '_');
            return normalized switch
            {
                "IN" or "PUNCHIN" or "CLOCKIN" => "IN",
                "OUT" or "PUNCHOUT" or "CLOCKOUT" => "OUT",
                "BREAK_OUT" or "BREAKOUT" => "BREAK_OUT",
                "BREAK_IN" or "BREAKIN" => "BREAK_IN",
                _ => null
            };
        }

        private static DateTime AsUtc(DateTime value) =>
            value.Kind switch
            {
                DateTimeKind.Utc => value,
                DateTimeKind.Local => value.ToUniversalTime(),
                _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
            };

        private static TimeZoneInfo ResolveTimeZone(string? tenantTimeZoneId, string? companyState)
        {
            if (!string.IsNullOrWhiteSpace(tenantTimeZoneId))
            {
                try
                {
                    return TimeZoneInfo.FindSystemTimeZoneById(tenantTimeZoneId.Trim());
                }
                catch (TimeZoneNotFoundException)
                {
                    var alias = tenantTimeZoneId.Trim() switch
                    {
                        "America/Los_Angeles" => "Pacific Standard Time",
                        "America/Denver" => "Mountain Standard Time",
                        "America/Phoenix" => "US Mountain Standard Time",
                        "America/Chicago" => "Central Standard Time",
                        "America/New_York" => "Eastern Standard Time",
                        "Asia/Kolkata" or "Asia/Calcutta" => "India Standard Time",
                        _ => null
                    };
                    if (alias != null)
                    {
                        try { return TimeZoneInfo.FindSystemTimeZoneById(alias); }
                        catch { /* fall through */ }
                    }
                }
                catch (InvalidTimeZoneException)
                {
                    // fall through to state
                }
            }

            return GetTimeZoneForState(companyState);
        }

        private static TimeZoneInfo GetTimeZoneForState(string? state)
        {
            if (string.IsNullOrWhiteSpace(state))
            {
                return TimeZoneInfo.Utc;
            }

            var s = state.Trim().ToUpperInvariant();
            if (s is "CA" or "CALIFORNIA" or "NV" or "OR" or "WA")
            {
                return TimeZoneInfo.FindSystemTimeZoneById("Pacific Standard Time");
            }

            if (s is "AZ" or "ARIZONA")
            {
                return TimeZoneInfo.FindSystemTimeZoneById("US Mountain Standard Time");
            }

            if (s is "CO" or "MT" or "NM" or "UT" or "WY" or "ID")
            {
                return TimeZoneInfo.FindSystemTimeZoneById("Mountain Standard Time");
            }

            if (s is "AL" or "AR" or "IL" or "IA" or "KS" or "KY" or "LA" or "MN" or "MS" or "MO"
                or "NE" or "ND" or "OK" or "SD" or "TN" or "TX" or "WI" or "TEXAS")
            {
                return TimeZoneInfo.FindSystemTimeZoneById("Central Standard Time");
            }

            return TimeZoneInfo.FindSystemTimeZoneById("Eastern Standard Time");
        }
    }
}
