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
        /// Compact Vendor Quotation prompt for Haiku. Short to minimize input tokens.
        /// </summary>
        public const string VendorQuotationExtractionPrompt = @"Return ONLY JSON (no markdown). null if missing. Dates yyyy-MM-dd. Do not invent.

Rules: vendorNames=array; prefer Bill To/Ship To/Supplier over issuer; split multi-vendors. Line items: qty,unit,unitPrice,amount; partNo exact from PART NO/SKU; itemName only if Item column exists else null; discount+discountType(Amount|Percent) never in notes; notes=doc notes only; one parts[] per part/job.

{""documentType"":string,""quotationNumber"":string,""quotationDate"":string,""dueDate"":string,""projectName"":string,""material"":string,""vendorNames"":[string],""vendorContactName"":string,""vendorPhone"":string,""vendorEmail"":string,""details"":[{""itemName"":string,""itemDescription"":string,""quantity"":number,""unit"":string,""unitPrice"":number,""amount"":number,""discount"":number,""discountType"":string,""notes"":string,""parts"":[{""partNo"":string,""jobNo"":string,""partName"":string,""description"":string,""material"":string,""quantity"":number,""unit"":string,""remarks"":string}]}]}";

        public static string ResolvePrompt(string documentKind)
        {
            return documentKind switch
            {
                DocumentExtractionKinds.VendorQuotation => VendorQuotationExtractionPrompt,
                _ => throw new InvalidOperationException($"Unsupported document extraction kind: {documentKind}")
            };
        }

        /// <summary>
        /// Locked cheapest Claude model for document extraction.
        /// Sonnet/Opus and other tiers are never used on this path.
        /// </summary>
        public const string DefaultHaikuModel = "claude-haiku-4-5";

        /// <summary>
        /// Always returns <see cref="DefaultHaikuModel"/>.
        /// Configured Claude:Model is ignored so a higher tier can never be selected.
        /// </summary>
        public static string ResolveClaudeModel(string? configuredModel, bool allowAutoSwitch)
        {
            _ = configuredModel;
            _ = allowAutoSwitch;
            EnsureCheapClaudeModel(DefaultHaikuModel);
            return DefaultHaikuModel;
        }

        /// <summary>
        /// Hard guard: must be exactly the locked Haiku model (no Sonnet/Opus/other).
        /// </summary>
        public static void EnsureCheapClaudeModel(string model)
        {
            if (string.IsNullOrWhiteSpace(model))
                throw new InvalidOperationException(
                    "Claude model is empty. Document extraction is locked to claude-haiku-4-5 only.");

            var normalized = model.Trim();
            if (!string.Equals(normalized, DefaultHaikuModel, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException(
                    $"Claude model '{normalized}' is not allowed. Document extraction is locked to '{DefaultHaikuModel}' only (no Sonnet/Opus/other).");
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
