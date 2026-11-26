using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CimmpleAPI.Services.Tenancy
{
    /// <summary>
    /// Turns a queued <see cref="SignupRequest"/> into a trial client: the standard provisioning run
    /// (roles, permissions, chart of accounts, machine shop sample data), then the credentials email.
    /// Failures are retried with backoff; a half-built client is resumed rather than created twice.
    /// </summary>
    public class SignupProvisioningService
    {
        public const string CreatedBy = "self-signup";

        private static readonly TimeSpan ClaimDuration = TimeSpan.FromMinutes(10);
        private const int ClaimAttempts = 3;
        private const int MaxBackoffMinutes = 30;

        private readonly CimmpleDbContext _db;
        private readonly TenantProvisioningService _provisioning;
        private readonly MasterDataSetupService _masterData;
        private readonly SignupOptions _options;
        private readonly ILogger<SignupProvisioningService> _logger;

        public SignupProvisioningService(
            CimmpleDbContext db,
            TenantProvisioningService provisioning,
            MasterDataSetupService masterData,
            IOptions<SignupOptions> options,
            ILogger<SignupProvisioningService> logger)
        {
            _db = db;
            _provisioning = provisioning;
            _masterData = masterData;
            _options = options.Value;
            _logger = logger;
        }

        /// <summary>Claims and processes one due signup. Returns false when nothing was waiting.</summary>
        public async Task<bool> ProcessNextAsync(CancellationToken cancellationToken)
        {
            await SignupSchemaService.EnsureAsync(_db);
            await TenantSchemaService.EnsureTableAsync(_db);

            var row = await ClaimNextAsync(cancellationToken);
            if (row == null)
                return false;

            try
            {
                var outcome = await RunAsync(row);
                await RecordAsync(row, outcome);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                // Shutting down: hand the row back untouched so the next run starts it cleanly.
                await ReleaseAsync(row.Id);
                throw;
            }
            catch (Exception ex)
            {
                _db.ChangeTracker.Clear();
                _logger.LogError(ex, "Signup {SignupId} for {Email} failed on attempt {Attempt}", row.Id, row.Email, row.Attempts);
                await RecordAsync(row, StepOutcome.Retry(ex.GetBaseException().Message));
            }

            return true;
        }

        private async Task<StepOutcome> RunAsync(SignupRequest row)
        {
            if (row.Attempts > Math.Max(1, _options.MaxAttempts))
                return StepOutcome.Fail($"Gave up after {row.Attempts - 1} attempts. {row.LastError}".Trim());

            // A crash between creating the client and recording it leaves an unlinked client behind.
            var tenantId = row.TenantId ?? (row.Attempts > 1 ? await FindUnlinkedTenantAsync(row) : null);
            if (tenantId != null)
                return await FinishExistingClientAsync(row, tenantId.Value);

            var request = BuildRequest(row);
            var result = await _provisioning.ProvisionAsync(request, CreatedBy);

            // No client was created: the request itself is unusable, so retrying cannot help.
            var created = result.Tenant;
            if (created == null)
                return StepOutcome.Fail(result.Error ?? "The client could not be created.");

            await LinkTenantAsync(row.Id, created.TenantId);

            if (!result.Success)
                return StepOutcome.Retry(result.Error ?? "Setup did not finish.");

            if (result.SampleError != null)
            {
                _logger.LogWarning("Signup {SignupId}: sample data for tenant {TenantId} did not finish: {Error}",
                    row.Id, created.TenantId, result.SampleError);
            }

            if (!result.InviteQueued)
                return StepOutcome.Retry(result.InviteError ?? "The credentials email could not be queued.");

            _logger.LogInformation("Signup {SignupId}: trial client {TenantId} ({Company}) is ready, trial ends {TrialEnds:u}",
                row.Id, created.TenantId, row.CompanyName, created.TrialEndsUtc);
            return StepOutcome.Done;
        }

        /// <summary>Picks up a client an earlier attempt created: finishes setup if needed, then sends the credentials.</summary>
        private async Task<StepOutcome> FinishExistingClientAsync(SignupRequest row, int tenantId)
        {
            var tenant = await _db.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.TenantId == tenantId);
            if (tenant == null)
                return StepOutcome.Fail($"Client {tenantId} no longer exists.");

            await LinkTenantAsync(row.Id, tenantId);

            if (tenant.Status == TenantStatus.Provisioning)
            {
                var resumed = await _provisioning.ResumeAsync(tenantId);
                if (!resumed.Success)
                    return StepOutcome.Retry(resumed.Error ?? "Setup did not finish.");

                await TryApplySamplesAsync(row, tenantId);
            }
            else if (tenant.Status != TenantStatus.Active)
            {
                // Support changed the client while the signup was retrying; leave it alone.
                return StepOutcome.Fail($"Client {tenantId} is {tenant.Status}.");
            }

            // The first attempt may have failed before any email went out, so issue fresh credentials.
            var invite = await _provisioning.ResendAdminInviteAsync(tenantId);
            if (!invite.Success)
                return StepOutcome.Retry(invite.Error ?? "The credentials email could not be sent.");
            if (!invite.InviteQueued)
                return StepOutcome.Retry(invite.InviteError ?? "The credentials email could not be queued.");

            _logger.LogInformation("Signup {SignupId}: trial client {TenantId} completed on attempt {Attempt}", row.Id, tenantId, row.Attempts);
            return StepOutcome.Done;
        }

        private async Task TryApplySamplesAsync(SignupRequest row, int tenantId)
        {
            try
            {
                var masters = TenantProvisioningService.SampleMastersFor(BuildRequest(row));
                var batch = await _masterData.ApplySamplesAsync(tenantId, MachineShopIndustry.Code, masters, CreatedBy);
                if (!batch.Success)
                {
                    _logger.LogWarning("Signup {SignupId}: sample data for tenant {TenantId} did not finish: {Error}",
                        row.Id, tenantId, batch.Error);
                }
            }
            catch (Exception ex)
            {
                _db.ChangeTracker.Clear();
                _logger.LogWarning(ex, "Signup {SignupId}: sample data for tenant {TenantId} failed", row.Id, tenantId);
            }
        }

        private Task LinkTenantAsync(int signupId, int tenantId) =>
            _db.SignupRequests.Where(s => s.Id == signupId && s.TenantId == null)
                .ExecuteUpdateAsync(set => set.SetProperty(s => s.TenantId, (int?)tenantId));

        private Task<int?> FindUnlinkedTenantAsync(SignupRequest row) =>
            _db.Tenants.AsNoTracking()
                .Where(t => t.CreatedBy == CreatedBy && t.ContactEmail == row.Email && t.CreatedUtc >= row.CreatedUtc)
                .OrderBy(t => t.TenantId)
                .Select(t => (int?)t.TenantId)
                .FirstOrDefaultAsync();

        /// <summary>Trial plan with no employee logins (only the administrator signs in) and the machine shop starter data.</summary>
        private ProvisionTenantRequest BuildRequest(SignupRequest row) => new()
        {
            CompanyName = row.CompanyName,
            AdminFirstName = row.FirstName,
            AdminLastName = row.LastName,
            AdminEmail = row.Email,
            Plan = TenantPlans.Trial,
            LoginSeatLimit = 0,
            Industry = MachineShopIndustry.Code,
            IncludeSampleData = true,
            SendInviteEmail = true,
            Notes = $"Self-service trial signup #{row.Id}",
            TrialEndsUtc = DateTime.UtcNow.AddDays(_options.EffectiveTrialDays)
        };

        private async Task<SignupRequest?> ClaimNextAsync(CancellationToken cancellationToken)
        {
            // Several API instances may poll at once; the conditional UPDATE lets exactly one win each row.
            for (var i = 0; i < ClaimAttempts; i++)
            {
                var now = DateTime.UtcNow;

                var id = await _db.SignupRequests.AsNoTracking()
                    .Where(s =>
                        (s.Status == SignupRequest.StatusPending && (s.NextAttemptUtc == null || s.NextAttemptUtc <= now))
                        || (s.Status == SignupRequest.StatusProcessing && s.LockedUntilUtc < now))
                    .OrderBy(s => s.CreatedUtc)
                    .Select(s => s.Id)
                    .FirstOrDefaultAsync(cancellationToken);
                if (id == 0)
                    return null;

                var lockedUntil = now + ClaimDuration;
                var claimed = await _db.SignupRequests
                    .Where(s => s.Id == id &&
                        ((s.Status == SignupRequest.StatusPending && (s.NextAttemptUtc == null || s.NextAttemptUtc <= now))
                         || (s.Status == SignupRequest.StatusProcessing && s.LockedUntilUtc < now)))
                    .ExecuteUpdateAsync(set => set
                        .SetProperty(s => s.Status, SignupRequest.StatusProcessing)
                        .SetProperty(s => s.LockedUntilUtc, (DateTime?)lockedUntil)
                        .SetProperty(s => s.Attempts, s => s.Attempts + 1), cancellationToken);
                if (claimed == 1)
                    return await _db.SignupRequests.AsNoTracking().FirstAsync(s => s.Id == id, cancellationToken);
            }

            return null;
        }

        private Task RecordAsync(SignupRequest row, StepOutcome outcome)
        {
            var now = DateTime.UtcNow;

            if (outcome.Kind == StepKind.Done)
            {
                return _db.SignupRequests.Where(s => s.Id == row.Id)
                    .ExecuteUpdateAsync(set => set
                        .SetProperty(s => s.Status, SignupRequest.StatusCompleted)
                        .SetProperty(s => s.LockedUntilUtc, (DateTime?)null)
                        .SetProperty(s => s.NextAttemptUtc, (DateTime?)null)
                        .SetProperty(s => s.LastError, (string?)null)
                        .SetProperty(s => s.CompletedUtc, (DateTime?)now));
            }

            var error = Truncate(outcome.Error);
            var giveUp = outcome.Kind == StepKind.Fail || row.Attempts >= Math.Max(1, _options.MaxAttempts);
            if (giveUp)
            {
                _logger.LogError("Signup {SignupId} for {Email} needs attention: {Error}", row.Id, row.Email, error);
                return _db.SignupRequests.Where(s => s.Id == row.Id)
                    .ExecuteUpdateAsync(set => set
                        .SetProperty(s => s.Status, SignupRequest.StatusFailed)
                        .SetProperty(s => s.LockedUntilUtc, (DateTime?)null)
                        .SetProperty(s => s.NextAttemptUtc, (DateTime?)null)
                        .SetProperty(s => s.LastError, error));
            }

            var retryAt = now.AddMinutes(Math.Min(Math.Pow(2, Math.Max(0, row.Attempts - 1)), MaxBackoffMinutes));
            _logger.LogWarning("Signup {SignupId} will retry at {RetryAt:u}: {Error}", row.Id, retryAt, error);
            return _db.SignupRequests.Where(s => s.Id == row.Id)
                .ExecuteUpdateAsync(set => set
                    .SetProperty(s => s.Status, SignupRequest.StatusPending)
                    .SetProperty(s => s.LockedUntilUtc, (DateTime?)null)
                    .SetProperty(s => s.NextAttemptUtc, (DateTime?)retryAt)
                    .SetProperty(s => s.LastError, error));
        }

        private async Task ReleaseAsync(int id)
        {
            try
            {
                await _db.SignupRequests.Where(s => s.Id == id && s.Status == SignupRequest.StatusProcessing)
                    .ExecuteUpdateAsync(set => set
                        .SetProperty(s => s.Status, SignupRequest.StatusPending)
                        .SetProperty(s => s.LockedUntilUtc, (DateTime?)null)
                        .SetProperty(s => s.Attempts, s => s.Attempts - 1));
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not release signup {SignupId}; its claim will lapse on its own", id);
            }
        }

        private static string? Truncate(string? error) =>
            string.IsNullOrEmpty(error) ? error : error.Length > 2000 ? error[..2000] : error;

        private enum StepKind
        {
            Done,
            Retry,
            Fail
        }

        private readonly record struct StepOutcome(StepKind Kind, string? Error = null)
        {
            public static StepOutcome Done => new(StepKind.Done);
            public static StepOutcome Retry(string error) => new(StepKind.Retry, error);
            public static StepOutcome Fail(string error) => new(StepKind.Fail, error);
        }
    }
}
