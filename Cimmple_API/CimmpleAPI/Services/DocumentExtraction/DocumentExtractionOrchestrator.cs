using System;
using System.Threading;
using System.Threading.Tasks;
using CimmpleAPI.Data.Dtos;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CimmpleAPI.Services.DocumentExtraction
{
    /// <summary>
    /// Primary: hosted Cimmple extraction API (api.extraction.cimmple.net).
    /// Fallback: Claude Haiku only when FallbackToClaude=true AND the hosted call fails.
    /// </summary>
    public class DocumentExtractionOrchestrator : IDocumentExtractionService
    {
        private readonly CimmpleExtractionApiClient _cimmpleApi;
        private readonly IClaudeDocumentExtractionService _claude;
        private readonly DocumentExtractionSettings _settings;
        private readonly IConfiguration _configuration;
        private readonly ILogger<DocumentExtractionOrchestrator> _logger;

        public DocumentExtractionOrchestrator(
            CimmpleExtractionApiClient cimmpleApi,
            IClaudeDocumentExtractionService claude,
            IOptions<DocumentExtractionSettings> settings,
            IConfiguration configuration,
            ILogger<DocumentExtractionOrchestrator> logger)
        {
            _cimmpleApi = cimmpleApi;
            _claude = claude;
            _settings = settings.Value;
            _configuration = configuration;
            _logger = logger;
        }

        public async Task<DocumentExtractionOutcome> ExtractVendorQuotationFromPdfAsync(
            byte[] pdfBytes,
            string? fileName = null,
            CancellationToken cancellationToken = default)
        {
            if (pdfBytes == null || pdfBytes.Length == 0)
                throw new ArgumentException("PDF file is empty.", nameof(pdfBytes));

            var preferCimmple = PreferCimmpleApi();
            var fallbackToClaude = ResolveFallbackToClaude();

            Console.WriteLine(
                $"[DocumentExtraction] PreferCimmpleApi={preferCimmple}, FallbackToClaude={fallbackToClaude}, File={fileName}, Bytes={pdfBytes.Length}");

            if (!preferCimmple)
            {
                if (!fallbackToClaude)
                {
                    throw new InvalidOperationException(
                        "DocumentExtraction:Provider is not CimmpleApi and Claude fallback is disabled.");
                }

                Console.WriteLine("[DocumentExtraction] Skipping CimmpleApi (disabled/not configured); using Claude.");
                return await ExtractWithClaudeAsync(pdfBytes, fileName, cancellationToken);
            }

            // Fail fast on hosted API so Claude fallback can start quickly when the host is down.
            using var hostedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            var hostedTimeoutSeconds = _settings.CimmpleApi?.TimeoutSeconds > 0
                ? Math.Clamp(_settings.CimmpleApi.TimeoutSeconds, 5, 60)
                : 20;
            hostedCts.CancelAfter(TimeSpan.FromSeconds(hostedTimeoutSeconds));

            CimmpleExtractionAttempt remote;
            try
            {
                remote = await _cimmpleApi.TryExtractVendorQuotationAsync(
                    pdfBytes,
                    fileName,
                    hostedCts.Token);
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                remote = new CimmpleExtractionAttempt
                {
                    Error = $"api.extraction.cimmple.net timed out after {hostedTimeoutSeconds}s."
                };
            }

            if (remote.Succeeded && remote.Result != null)
            {
                Console.WriteLine("[DocumentExtraction] SUCCESS via CimmpleApi (api.extraction.cimmple.net)");
                _logger.LogWarning(
                    "Vendor quotation extracted via Cimmple extraction API ({File}).",
                    fileName ?? "document.pdf");

                return new DocumentExtractionOutcome
                {
                    Result = remote.Result,
                    Provider = "CimmpleApi",
                    Message = "Extracted via api.extraction.cimmple.net"
                };
            }

            var hostedError = string.IsNullOrWhiteSpace(remote.Error)
                ? "api.extraction.cimmple.net did not return usable data."
                : remote.Error!;

            Console.WriteLine(
                $"[DocumentExtraction] CimmpleApi failed. FallbackToClaude={fallbackToClaude}. Error={hostedError}");
            _logger.LogWarning(
                "Cimmple extraction API unavailable for {File}. FallbackToClaude={Fallback}. Error={Error}",
                fileName ?? "document.pdf",
                fallbackToClaude,
                hostedError);

            if (!fallbackToClaude)
            {
                throw new InvalidOperationException(hostedError);
            }

            return await ExtractWithClaudeAsync(pdfBytes, fileName, cancellationToken);
        }

        private async Task<DocumentExtractionOutcome> ExtractWithClaudeAsync(
            byte[] pdfBytes,
            string? fileName,
            CancellationToken cancellationToken)
        {
            var viaFallback = PreferCimmpleApi();
            Console.WriteLine(
                viaFallback
                    ? "[DocumentExtraction] Using Claude Haiku FALLBACK"
                    : "[DocumentExtraction] Using Claude Haiku (primary)");
            _logger.LogWarning(
                "Extracting vendor quotation via Claude Haiku ({Mode}) ({File}).",
                viaFallback ? "fallback" : "primary",
                fileName ?? "document.pdf");

            var claudeResult = await _claude.ExtractVendorQuotationFromPdfAsync(
                pdfBytes,
                fileName,
                cancellationToken);

            return new DocumentExtractionOutcome
            {
                Result = claudeResult,
                Provider = "Claude",
                Message = viaFallback
                    ? "Extracted via Claude Haiku fallback"
                    : "Extracted via Claude Haiku"
            };
        }

        private bool ResolveFallbackToClaude()
        {
            var raw = _configuration["DocumentExtraction:FallbackToClaude"];
            if (!string.IsNullOrWhiteSpace(raw))
            {
                if (string.Equals(raw, "true", StringComparison.OrdinalIgnoreCase))
                    return true;
                if (string.Equals(raw, "false", StringComparison.OrdinalIgnoreCase))
                    return false;
            }

            return _settings.FallbackToClaude;
        }

        private bool PreferCimmpleApi()
        {
            var provider = (_settings.Provider
                ?? _configuration["DocumentExtraction:Provider"]
                ?? "CimmpleApi").Trim();

            if (string.Equals(provider, "Claude", StringComparison.OrdinalIgnoreCase))
                return false;

            if (_cimmpleApi.IsEnabled)
                return true;

            var apiKey = _configuration["DocumentExtraction:CimmpleApi:ApiKey"];
            var baseUrl = _configuration["DocumentExtraction:CimmpleApi:BaseUrl"];
            var enabledRaw = _configuration["DocumentExtraction:CimmpleApi:Enabled"];
            var enabled = string.IsNullOrWhiteSpace(enabledRaw)
                || !string.Equals(enabledRaw, "false", StringComparison.OrdinalIgnoreCase);

            return enabled
                && !string.IsNullOrWhiteSpace(apiKey)
                && !string.IsNullOrWhiteSpace(baseUrl);
        }
    }
}
