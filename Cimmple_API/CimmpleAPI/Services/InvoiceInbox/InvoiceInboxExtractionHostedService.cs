using CimmpleAPI.Services.InvoiceInbox;
using Microsoft.Extensions.Options;

namespace CimmpleAPI.Services.InvoiceInbox
{
    /// <summary>Polls the Draft Inbox and extracts newly received invoice PDFs in the background.</summary>
    public class InvoiceInboxExtractionHostedService : BackgroundService
    {
        private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(10);
        private const int BatchSize = 5;

        private readonly IServiceScopeFactory _scopeFactory;
        private readonly InboundMailSettings _settings;
        private readonly ILogger<InvoiceInboxExtractionHostedService> _logger;

        public InvoiceInboxExtractionHostedService(
            IServiceScopeFactory scopeFactory,
            IOptions<InboundMailSettings> settings,
            ILogger<InvoiceInboxExtractionHostedService> logger)
        {
            _scopeFactory = scopeFactory;
            _settings = settings.Value;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            if (!_settings.Enabled || !_settings.AutoExtract)
            {
                _logger.LogInformation("Invoice inbox extraction runner disabled by configuration");
                return;
            }

            _logger.LogInformation("Invoice inbox extraction runner started");
            try { await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken); }
            catch (OperationCanceledException) { return; }

            while (!stoppingToken.IsCancellationRequested)
            {
                var handled = 0;
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var service = scope.ServiceProvider.GetRequiredService<InvoiceInboxExtractionService>();
                    handled = await service.ProcessPendingAsync(BatchSize, stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Invoice inbox extraction poll failed");
                }

                // Drain a backlog without waiting; otherwise idle between polls.
                if (handled >= BatchSize) continue;

                try { await Task.Delay(PollInterval, stoppingToken); }
                catch (OperationCanceledException) { break; }
            }

            _logger.LogInformation("Invoice inbox extraction runner stopped");
        }
    }
}
