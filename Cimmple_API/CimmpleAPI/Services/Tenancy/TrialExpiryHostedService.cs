using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services.Tenancy
{
    /// <summary>
    /// Suspends clients whose free trial has ended. Suspending also ends their sessions.
    /// Sign-in is already refused at the deadline (see AuthService), so the interval only
    /// decides how soon sessions that are still open are cut off.
    /// </summary>
    public class TrialExpiryHostedService : BackgroundService
    {
        private static readonly TimeSpan StartupDelay = TimeSpan.FromSeconds(30);
        private static readonly TimeSpan CheckInterval = TimeSpan.FromMinutes(5);

        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<TrialExpiryHostedService> _logger;

        public TrialExpiryHostedService(IServiceScopeFactory scopeFactory, ILogger<TrialExpiryHostedService> logger)
        {
            _scopeFactory = scopeFactory;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Trial expiry runner started");
            try { await Task.Delay(StartupDelay, stoppingToken); }
            catch (OperationCanceledException) { return; }

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await SuspendExpiredTrialsAsync(stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Trial expiry check failed");
                }

                try { await Task.Delay(CheckInterval, stoppingToken); }
                catch (OperationCanceledException) { break; }
            }

            _logger.LogInformation("Trial expiry runner stopped");
        }

        private async Task SuspendExpiredTrialsAsync(CancellationToken cancellationToken)
        {
            List<int> expired;
            using (var scope = _scopeFactory.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<CimmpleDbContext>();
                await TenantSchemaService.EnsureTableAsync(db);

                var now = DateTime.UtcNow;
                expired = await db.Tenants.AsNoTracking()
                    .Where(t => t.Status == TenantStatus.Active && t.TrialEndsUtc != null && t.TrialEndsUtc <= now)
                    .Select(t => t.TenantId)
                    .ToListAsync(cancellationToken);
            }

            foreach (var tenantId in expired)
            {
                cancellationToken.ThrowIfCancellationRequested();
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var provisioning = scope.ServiceProvider.GetRequiredService<TenantProvisioningService>();
                    var (ok, error) = await provisioning.SetStatusAsync(tenantId, TenantStatus.Suspended);
                    if (ok)
                        _logger.LogInformation("Trial ended: tenant {TenantId} suspended", tenantId);
                    else
                        _logger.LogWarning("Trial ended but tenant {TenantId} could not be suspended: {Error}", tenantId, error);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    _logger.LogError(ex, "Suspending tenant {TenantId} after its trial failed", tenantId);
                }
            }
        }
    }
}
