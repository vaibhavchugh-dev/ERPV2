using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CimmpleAPI.Services
{
    /// <summary>Polls EmailOutbox and sends pending mail via SMTP.</summary>
    public class EmailOutboxHostedService : BackgroundService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<EmailOutboxHostedService> _logger;
        private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(3);

        public EmailOutboxHostedService(
            IServiceScopeFactory scopeFactory,
            ILogger<EmailOutboxHostedService> logger)
        {
            _scopeFactory = scopeFactory;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Email outbox runner started");
            try { await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken); }
            catch (OperationCanceledException) { return; }

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var outbox = scope.ServiceProvider.GetRequiredService<EmailOutboxService>();
                    await outbox.ProcessPendingAsync(stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Email outbox poll failed");
                }

                try { await Task.Delay(PollInterval, stoppingToken); }
                catch (OperationCanceledException) { break; }
            }

            _logger.LogInformation("Email outbox runner stopped");
        }
    }
}
