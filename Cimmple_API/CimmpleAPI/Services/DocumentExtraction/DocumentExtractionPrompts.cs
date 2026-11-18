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
        public const string VendorQuotationExtractionPrompt = @"Extract all engineering drawing information, fabrication drawing information, BOM tables, material takeoff data, RFQ information, vendor quotation information, and line item details from this PDF document.

IMPORTANT RULES:

* Return ONLY a valid JSON object.
* Do NOT wrap the response in markdown.
* Do NOT use `json or ` fences.
* Do NOT include explanations, notes, warnings, comments, or additional text.
* The entire response must be directly parseable by JsonSerializer.Deserialize().
* Use null for missing values.
* Dates must be ISO 8601 format (yyyy-MM-dd).
* Extract all identifiable line items, assemblies, subassemblies, materials, and parts.
* Preserve quantities exactly as shown.
* Preserve vendor names exactly as shown.
* Preserve part numbers exactly as shown.
* Preserve job numbers exactly as shown.
* Do not invent values.
* Do not combine multiple vendors into a single string.
* Do not combine multiple part numbers into a single string.
* Do not combine multiple job numbers into a single string.

VENDOR EXTRACTION RULES:

* vendorNames must always be an array.
* Prefer Bill To / Ship To / Supplier / Vendor company names for vendorNames.
* Do NOT put the document issuer / from-company into vendorNames when Bill To or Ship To is present.
* If multiple vendor names are listed, extract each vendor separately.
* If vendor names are comma-separated, split them into separate array entries.
* If vendor names appear on separate lines, extract each as a separate array entry.

ITEM NAME RULES

* Populate itemName ONLY when the document explicitly contains a column or field named:
Item Name
Item
* If no Item Name field or column exists in the document, set:
itemName = null

PART EXTRACTION RULES:

* A detail item may contain multiple Part Numbers.
* A detail item may contain multiple Job Numbers.
* Create one object in parts[] for each identifiable part.
* If only Part Numbers exist, create one parts[] record per Part Number.
* If only Job Numbers exist, create one parts[] record per Job Number.
* If both Part Numbers and Job Numbers exist, associate them in the order they appear.
* If a drawing contains only part names, populate partName and leave unavailable fields as null.

PART NUMBER EXTRACTION RULES

* If the source column/header is ""PART NUMBER"", ""PART NO"", ""PART#"", ""PART NUM"", or similar, always map the value to partNo exactly as shown.
* partNo may contain any combination of:

  * letters
  * numbers
  * spaces
  * dashes
  * slashes
  * periods
  * special engineering characters

Valid examples:
A-1001
BP-22
12345
DWG-100
P001
AB1234
Rectangular Beam
Handrail Assembly
Support Frame

* Do not attempt to determine whether the value is a code or a descriptive name.
* If the value appears under a Part Number column, store it in partNo exactly as displayed.


COLUMN PRIORITY

PART NUMBER column → partNo
PART NAME column → partName
ITEM NAME column → itemName
DESCRIPTION column → description
QTY column → quantity
UNIT column → unit
JOB NO column → jobNo


DRAWING EXTRACTION RULES:

* Extract drawing metadata when available.
* Extract BOM tables.
* Extract material lists.
* Extract part callouts.
* Extract fabrication details.
* Extract assembly details.
* Extract all identifiable part names.

Return JSON matching EXACTLY this schema:

{
""documentType"": string,

""drawingNumber"": string,
""drawingTitle"": string,
""revision"": string,
""revisionDate"": string,
""sheetNumber"": string,
""totalSheets"": string,
""drawingDate"": string,
""projectName"": string,
""clientName"": string,
""companyName"": string,
""drawnBy"": string,
""checkedBy"": string,
""approvedBy"": string,
""scale"": string,
""units"": string,
""material"": string,

""quotationNumber"": string,
""quotationDate"": string,
""dueDate"": string,

""vendorNames"": [
string
],

""vendorContactName"": string,
""vendorPhone"": string,
""vendorEmail"": string,

""details"": [
{
""itemName"": string,
""itemDescription"": string,
""quantity"": number,
""unit"": string,
""unitPrice"": number,
""amount"": number,
""discount"": number,
""discountType"": string,
""notes"": string,

  ""parts"": [
    {
      ""partNo"": string,
      ""jobNo"": string,
      ""partName"": string,
      ""description"": string,
      ""material"": string,
      ""quantity"": number,
      ""unit"": string,
      ""remarks"": string
    }
  ]
}

]
}

DISCOUNT RULES:

* Put line discount in discount + discountType only.
* discountType must be ""Amount"" or ""Percent"".
* Do NOT write discount values into notes or remarks.
* notes must contain only document notes/remarks text (no duplicated lines).";

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
