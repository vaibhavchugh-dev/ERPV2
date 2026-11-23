using System;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using CimmpleAPI.Data.Dtos;
using Microsoft.Extensions.Options;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace CimmpleAPI.Services.DocumentExtraction
{
    /// <summary>
    /// Claude Haiku PDF extraction (fallback / direct). Haiku-only model guard.
    /// </summary>
    public class ClaudeDocumentExtractionService : IClaudeDocumentExtractionService
    {
        private const string ApiUrl = "https://api.anthropic.com/v1/messages";
        private const string AnthropicVersion = "2023-06-01";

        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ClaudeSettings _claudeSettings;
        private readonly DocumentExtractionSettings _extractionSettings;

        public ClaudeDocumentExtractionService(
            IHttpClientFactory httpClientFactory,
            IOptions<ClaudeSettings> claudeSettings,
            IOptions<DocumentExtractionSettings> extractionSettings)
        {
            _httpClientFactory = httpClientFactory;
            _claudeSettings = claudeSettings.Value;
            _extractionSettings = extractionSettings.Value;
        }

        public Task<VendorQuotationExtractionDto> ExtractVendorQuotationFromPdfAsync(
            byte[] pdfBytes,
            string? fileName = null,
            CancellationToken cancellationToken = default) =>
            ExtractDocumentFromPdfAsync(
                pdfBytes,
                DocumentExtractionKinds.VendorQuotation,
                fileName,
                cancellationToken);

        public async Task<VendorQuotationExtractionDto> ExtractDocumentFromPdfAsync(
            byte[] pdfBytes,
            string documentKind,
            string? fileName = null,
            CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(_claudeSettings?.ApiKey))
                throw new InvalidOperationException(
                    "Claude API key is not configured. Set Claude:ApiKey in appsettings.json.");

            if (pdfBytes == null || pdfBytes.Length == 0)
                throw new ArgumentException("PDF file is empty.", nameof(pdfBytes));

            var kind = DocumentExtractionKinds.Normalize(documentKind);
            if (!DocumentExtractionKinds.IsKnown(kind))
                throw new ArgumentException($"Unsupported document kind: {documentKind}", nameof(documentKind));

            // Strict low-model lock: always Haiku; ignore Claude:Model if set to a higher tier.
            var model = DocumentExtractionPrompts.ResolveClaudeModel(
                _claudeSettings.Model,
                _extractionSettings.AllowAutoSwitch);
            DocumentExtractionPrompts.EnsureCheapClaudeModel(model);
            // Belt-and-suspenders: never send whatever was in config.
            model = DocumentExtractionPrompts.DefaultHaikuModel;

            // Cap tokens for cheaper/faster Haiku (typical VQ JSON fits well under 2048).
            var configuredTokens = _claudeSettings.MaxTokens > 0 ? _claudeSettings.MaxTokens : 2048;
            var maxTokens = Math.Clamp(configuredTokens, 512, 4096);
            var prompt = DocumentExtractionPrompts.ResolvePrompt(kind);

            var requestBody = new JObject
            {
                ["model"] = model,
                ["max_tokens"] = maxTokens,
                ["messages"] = new JArray
                {
                    new JObject
                    {
                        ["role"] = "user",
                        ["content"] = new JArray
                        {
                            new JObject
                            {
                                ["type"] = "document",
                                ["source"] = new JObject
                                {
                                    ["type"] = "base64",
                                    ["media_type"] = "application/pdf",
                                    ["data"] = Convert.ToBase64String(pdfBytes)
                                }
                            },
                            new JObject
                            {
                                ["type"] = "text",
                                ["text"] = prompt
                            }
                        }
                    }
                }
            };

            var httpClient = _httpClientFactory.CreateClient("ClaudeDocumentExtraction");

            using var request = new HttpRequestMessage(HttpMethod.Post, ApiUrl);
            request.Headers.TryAddWithoutValidation("x-api-key", _claudeSettings.ApiKey);
            request.Headers.TryAddWithoutValidation("anthropic-version", AnthropicVersion);
            request.Content = new StringContent(
                requestBody.ToString(Formatting.None),
                Encoding.UTF8,
                "application/json");

            using var response = await httpClient.SendAsync(request, cancellationToken);
            var responseText = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
                throw new InvalidOperationException(
                    $"Claude API error ({(int)response.StatusCode}): {responseText}");

            var jsonText = DocumentExtractionPrompts.ExtractTextFromClaudeResponse(responseText);
            if (string.IsNullOrWhiteSpace(jsonText))
                throw new InvalidOperationException("Claude returned an empty response.");

            return DocumentExtractionPrompts.ParseVendorQuotationJson(jsonText);
        }
    }
}
