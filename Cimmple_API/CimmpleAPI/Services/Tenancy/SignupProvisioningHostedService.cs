namespace CimmpleAPI.Services.Tenancy
{
    /// <summary>
    /// Provisions queued trial signups in the background. Woken at once by a new signup and
    /// otherwise polls, so retries and signups taken by another API instance are not missed.
    /// </summary>
    public class SignupProvisioningHostedService : BackgroundService
    {
        private static readonly TimeSpan StartupDelay = TimeSpan.FromSeconds(10);
        private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(30);

        private readonly IServiceScopeFactory _scopeFactory;
        private readonly SignupWakeSignal _signal;
        private readonly ILogger<SignupProvisioningHostedService> _logger;

        public SignupProvisioningHostedService(
            IServiceScopeFactory scopeFactory,
            SignupWakeSignal signal,
            ILogger<SignupProvisioningHostedService> logger)
        {
            _scopeFactory = scopeFactory;
            _signal = signal;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Signup provisioning runner started");
            try { await Task.Delay(StartupDelay, stoppingToken); }
            catch (OperationCanceledException) { return; }

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    // One scope per signup keeps each run on a clean DbContext.
                    while (await ProcessNextAsync(stoppingToken))
                    {
                    }
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Signup provisioning poll failed");
                }

                try { await _signal.WaitAsync(PollInterval, stoppingToken); }
                catch (OperationCanceledException) { break; }
            }

            _logger.LogInformation("Signup provisioning runner stopped");
        }

        private async Task<bool> ProcessNextAsync(CancellationToken cancellationToken)
        {
            using var scope = _scopeFactory.CreateScope();
            var provisioning = scope.ServiceProvider.GetRequiredService<SignupProvisioningService>();
            return await provisioning.ProcessNextAsync(cancellationToken);
        }
    }
}
