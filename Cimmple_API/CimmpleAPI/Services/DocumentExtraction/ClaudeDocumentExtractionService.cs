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

        public async Task<VendorQuotationExtractionDto> ExtractVendorQuotationFromPdfAsync(
            byte[] pdfBytes,
            string? fileName = null,
            CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(_claudeSettings?.ApiKey))
                throw new InvalidOperationException(
                    "Claude API key is not configured. Set Claude:ApiKey in appsettings.json.");

            if (pdfBytes == null || pdfBytes.Length == 0)
                throw new ArgumentException("PDF file is empty.", nameof(pdfBytes));

            // Haiku-only: resolve + re-validate immediately before the Anthropic call.
            var model = DocumentExtractionPrompts.ResolveClaudeModel(
                _claudeSettings.Model,
                _extractionSettings.AllowAutoSwitch);
            DocumentExtractionPrompts.EnsureCheapClaudeModel(model);

            var maxTokens = _claudeSettings.MaxTokens > 0 ? _claudeSettings.MaxTokens : 8192;
            var prompt = DocumentExtractionPrompts.ResolvePrompt(DocumentExtractionKinds.VendorQuotation);

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
