using System;
using System.Collections.Generic;
using CimmpleAPI.Data.Dtos;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;

namespace CimmpleAPI.Services.DocumentExtraction
{
    /// <summary>
    /// Document-type keys for future extraction modules (Customer Quotation, Orders, etc.).
    /// Only VendorQuotation is registered today.
    /// </summary>
    public static class DocumentExtractionKinds
    {
        public const string VendorQuotation = "vendorQuotation";
    }

    public static class DocumentExtractionPrompts
    {
        /// <summary>
        /// Lean Vendor Quotation prompt (Haiku fallback). Keep short for faster responses.
        /// </summary>
        public const string VendorQuotationExtractionPrompt = @"Extract vendor quotation / RFQ data from this PDF. Return ONLY valid JSON (no markdown, no fences, no commentary). Use null for missing values. Dates must be yyyy-MM-dd. Do not invent values.

VENDOR:
* vendorNames is always a string array.
* Prefer Bill To / Ship To / Supplier / Vendor names.
* Do NOT use issuer/from-company when Bill To or Ship To exists.
* Split comma/line-separated vendor names into separate array entries.

LINES:
* Extract every line item with qty, unit, unitPrice, amount when present.
* partNo from PART NUMBER / PART NO / SKU columns exactly as shown.
* itemName only if an Item Name/Item column exists; otherwise null.
* Put discount in discount + discountType (""Amount"" or ""Percent"") only — never in notes.
* notes = document notes only (no duplicate lines, no discount text).
* One parts[] entry per part/job pair when both exist.

Schema:
{
""documentType"": string,
""quotationNumber"": string,
""quotationDate"": string,
""dueDate"": string,
""projectName"": string,
""material"": string,
""vendorNames"": [string],
""vendorContactName"": string,
""vendorPhone"": string,
""vendorEmail"": string,
""details"": [{
  ""itemName"": string,
  ""itemDescription"": string,
  ""quantity"": number,
  ""unit"": string,
  ""unitPrice"": number,
  ""amount"": number,
  ""discount"": number,
  ""discountType"": string,
  ""notes"": string,
  ""parts"": [{
    ""partNo"": string,
    ""jobNo"": string,
    ""partName"": string,
    ""description"": string,
    ""material"": string,
    ""quantity"": number,
    ""unit"": string,
    ""remarks"": string
  }]
}]
}";

        public static string ResolvePrompt(string documentKind)
        {
            return documentKind switch
            {
                DocumentExtractionKinds.VendorQuotation => VendorQuotationExtractionPrompt,
                _ => throw new InvalidOperationException($"Unsupported document extraction kind: {documentKind}")
            };
        }

        /// <summary>Only Claude Haiku models are allowed for document extraction (no Sonnet/Opus).</summary>
        public const string DefaultHaikuModel = "claude-haiku-4-5";

        public static string ResolveClaudeModel(string? configuredModel, bool allowAutoSwitch)
        {
            if (!string.IsNullOrWhiteSpace(configuredModel))
            {
                var model = configuredModel.Trim();
                EnsureCheapClaudeModel(model);
                return model;
            }

            if (!allowAutoSwitch)
                throw new InvalidOperationException(
                    "Claude:Model is not configured and DocumentExtraction:AllowAutoSwitch is disabled.");

            return DefaultHaikuModel;
        }

        /// <summary>
        /// Hard guard: model name must contain "haiku" and must not be Sonnet/Opus/upper tiers.
        /// </summary>
        public static void EnsureCheapClaudeModel(string model)
        {
            if (string.IsNullOrWhiteSpace(model))
                throw new InvalidOperationException(
                    "Claude model is empty. Only Haiku models are permitted for document extraction.");

            var normalized = model.Trim();
            var lower = normalized.ToLowerInvariant();

            if (lower.Contains("sonnet") || lower.Contains("opus") ||
                lower.Contains("sonnet-") || lower.Contains("opus-"))
            {
                throw new InvalidOperationException(
                    $"Claude model '{normalized}' is not allowed. Document extraction is restricted to Haiku only (no Sonnet/Opus).");
            }

            if (!lower.Contains("haiku"))
            {
                throw new InvalidOperationException(
                    $"Claude model '{normalized}' is not allowed. Only Haiku models are permitted for document extraction.");
            }
        }

        public static string StripJsonMarkdownFence(string text)
        {
            text = text.Trim();
            if (text.StartsWith("```", StringComparison.Ordinal))
            {
                var firstNewline = text.IndexOf('\n');
                if (firstNewline >= 0)
                    text = text.Substring(firstNewline + 1);
                if (text.EndsWith("```", StringComparison.Ordinal))
                    text = text.Substring(0, text.Length - 3);
            }
            return text.Trim();
        }

        public static string? ExtractTextFromClaudeResponse(string responseText)
        {
            var root = JObject.Parse(responseText);
            foreach (var block in root["content"] ?? new JArray())
            {
                if (block["type"]?.ToString() == "text")
                {
                    var text = block["text"]?.ToString();
                    if (!string.IsNullOrWhiteSpace(text))
                        return text;
                }
            }
            return null;
        }

        public static VendorQuotationExtractionDto ParseVendorQuotationJson(string jsonText)
        {
            jsonText = StripJsonMarkdownFence(jsonText);
            try
            {
                var dto = JsonConvert.DeserializeObject<VendorQuotationExtractionDto>(jsonText, new JsonSerializerSettings
                {
                    ContractResolver = new CamelCasePropertyNamesContractResolver(),
                    NullValueHandling = NullValueHandling.Ignore
                });

                if (dto == null)
                    return new VendorQuotationExtractionDto();

                dto.VendorNames ??= new List<string>();
                dto.Details ??= new List<VendorQuotationExtractionDetailDto>();
                foreach (var detail in dto.Details)
                {
                    detail.Parts ??= new List<VendorQuotationExtractionPartDto>();
                }

                return dto;
            }
            catch (JsonException ex)
            {
                throw new InvalidOperationException($"Failed to parse vendor quotation JSON: {ex.Message}", ex);
            }
        }
    }
}
