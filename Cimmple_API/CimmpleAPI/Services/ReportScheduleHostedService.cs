using CimmpleAPI.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CimmpleAPI.Services
{
    /// <summary>Polls due report schedules and emails generated attachments.</summary>
    public class ReportScheduleHostedService : BackgroundService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<ReportScheduleHostedService> _logger;
        private static readonly TimeSpan PollInterval = TimeSpan.FromMinutes(1);

        public ReportScheduleHostedService(
            IServiceScopeFactory scopeFactory,
            ILogger<ReportScheduleHostedService> logger)
        {
            _scopeFactory = scopeFactory;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Report schedule runner started");
            // Brief delay so the API finishes warm-up before first poll.
            try { await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken); }
            catch (OperationCanceledException) { return; }

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var runner = scope.ServiceProvider.GetRequiredService<ReportScheduleExecutionService>();
                    await runner.ProcessDueSchedulesAsync(stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Report schedule poll failed");
                }

                try { await Task.Delay(PollInterval, stoppingToken); }
                catch (OperationCanceledException) { break; }
            }

            _logger.LogInformation("Report schedule runner stopped");
        }
    }
}
