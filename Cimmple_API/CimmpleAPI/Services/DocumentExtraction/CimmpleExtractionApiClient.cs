using System;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using CimmpleAPI.Data.Dtos;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace CimmpleAPI.Services.DocumentExtraction
{
    /// <summary>
    /// Client for https://api.extraction.cimmple.net/api/documents/extract
    /// (multipart file + X-Api-Key).
    /// </summary>
    public class CimmpleExtractionApiClient
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly DocumentExtractionSettings _settings;
        private readonly IConfiguration _configuration;
        private readonly ILogger<CimmpleExtractionApiClient> _logger;

        public CimmpleExtractionApiClient(
            IHttpClientFactory httpClientFactory,
            IOptions<DocumentExtractionSettings> settings,
            IConfiguration configuration,
            ILogger<CimmpleExtractionApiClient> logger)
        {
            _httpClientFactory = httpClientFactory;
            _settings = settings.Value;
            _configuration = configuration;
            _logger = logger;
        }

        private string ResolveApiKey() =>
            FirstNonEmpty(
                _settings.CimmpleApi?.ApiKey,
                _configuration["DocumentExtraction:CimmpleApi:ApiKey"]);

        private string ResolveBaseUrl() =>
            FirstNonEmpty(
                _settings.CimmpleApi?.BaseUrl,
                _configuration["DocumentExtraction:CimmpleApi:BaseUrl"],
                "https://api.extraction.cimmple.net")!;

        private string ResolveExtractPath() =>
            FirstNonEmpty(
                _settings.CimmpleApi?.ExtractPath,
                _configuration["DocumentExtraction:CimmpleApi:ExtractPath"],
                "/api/documents/extract")!;

        private bool ResolveEnabled()
        {
            if (_settings.CimmpleApi != null && _settings.CimmpleApi.Enabled == false)
            {
                var raw = _configuration["DocumentExtraction:CimmpleApi:Enabled"];
                if (string.Equals(raw, "false", StringComparison.OrdinalIgnoreCase))
                    return false;
                if (string.Equals(raw, "true", StringComparison.OrdinalIgnoreCase))
                    return true;
                return false;
            }

            var enabledRaw = _configuration["DocumentExtraction:CimmpleApi:Enabled"];
            if (string.Equals(enabledRaw, "false", StringComparison.OrdinalIgnoreCase))
                return false;

            return true;
        }

        public bool IsEnabled
        {
            get
            {
                return ResolveEnabled()
                    && !string.IsNullOrWhiteSpace(ResolveApiKey())
                    && !string.IsNullOrWhiteSpace(ResolveBaseUrl());
            }
        }

        /// <summary>
        /// Calls the hosted extraction API. Never calls Claude — returns failure detail on error.
        /// </summary>
        public async Task<CimmpleExtractionAttempt> TryExtractVendorQuotationAsync(
            byte[] pdfBytes,
            string? fileName = null,
            CancellationToken cancellationToken = default)
        {
            if (pdfBytes == null || pdfBytes.Length == 0)
                throw new ArgumentException("PDF file is empty.", nameof(pdfBytes));

            if (!IsEnabled)
            {
                var msg =
                    $"Cimmple extraction API disabled/not configured. Enabled={ResolveEnabled()}, HasApiKey={!string.IsNullOrWhiteSpace(ResolveApiKey())}, BaseUrl={ResolveBaseUrl()}";
                Console.WriteLine($"[CimmpleExtractionApi] {msg}");
                _logger.LogWarning(msg);
                return new CimmpleExtractionAttempt { Error = msg };
            }

            var apiKey = ResolveApiKey()!;
            var baseUrl = ResolveBaseUrl().TrimEnd('/');
            var path = ResolveExtractPath();
            if (!path.StartsWith("/")) path = "/" + path;
            var url = baseUrl + path;

            Console.WriteLine($"[CimmpleExtractionApi] POST {url} ({pdfBytes.Length} bytes, file={fileName})");

            try
            {
                var httpClient = _httpClientFactory.CreateClient("CimmpleExtractionApi");

                using var content = new MultipartFormDataContent();
                var fileContent = new ByteArrayContent(pdfBytes);
                fileContent.Headers.ContentType =
                    new System.Net.Http.Headers.MediaTypeHeaderValue("application/pdf");
                var safeName = string.IsNullOrWhiteSpace(fileName)
                    ? "document.pdf"
                    : Path.GetFileName(fileName);
                if (!safeName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
                    safeName += ".pdf";
                content.Add(fileContent, "file", safeName);

                using var request = new HttpRequestMessage(HttpMethod.Post, url);
                request.Headers.TryAddWithoutValidation("X-Api-Key", apiKey);
                request.Headers.TryAddWithoutValidation("Accept", "application/json");
                request.Content = content;

                using var response = await httpClient.SendAsync(request, cancellationToken);
                var responseText = await response.Content.ReadAsStringAsync(cancellationToken);
                var status = (int)response.StatusCode;

                Console.WriteLine(
                    $"[CimmpleExtractionApi] HTTP {status}, bodyLength={responseText?.Length ?? 0}");

                if (!response.IsSuccessStatusCode)
                {
                    var snippet = Truncate(StripHtml(responseText), 300);
                    var error =
                        $"api.extraction.cimmple.net returned HTTP {status}. {snippet}".Trim();
                    Console.WriteLine($"[CimmpleExtractionApi] FAIL: {error}");
                    _logger.LogWarning(
                        "Cimmple extraction API returned {StatusCode}: {Body}",
                        status,
                        Truncate(responseText, 500));
                    return new CimmpleExtractionAttempt
                    {
                        StatusCode = status,
                        Error = error
                    };
                }

                if (string.IsNullOrWhiteSpace(responseText))
                {
                    const string emptyMsg = "api.extraction.cimmple.net returned an empty body.";
                    Console.WriteLine($"[CimmpleExtractionApi] {emptyMsg}");
                    _logger.LogWarning(emptyMsg);
                    return new CimmpleExtractionAttempt
                    {
                        StatusCode = status,
                        Error = emptyMsg
                    };
                }

                var mapped = MapResponseToVendorQuotation(responseText);
                if (mapped == null)
                {
                    const string mapMsg = "api.extraction.cimmple.net JSON could not be parsed/mapped.";
                    Console.WriteLine($"[CimmpleExtractionApi] {mapMsg}");
                    _logger.LogWarning(mapMsg);
                    return new CimmpleExtractionAttempt
                    {
                        StatusCode = status,
                        Error = mapMsg
                    };
                }

                Console.WriteLine(
                    $"[CimmpleExtractionApi] Mapped OK: vendors={mapped.VendorNames.Count}, details={mapped.Details.Count}, quotationNumber={mapped.QuotationNumber}");
                return new CimmpleExtractionAttempt
                {
                    Result = mapped,
                    StatusCode = status
                };
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                const string timeoutMsg = "api.extraction.cimmple.net timed out.";
                Console.WriteLine($"[CimmpleExtractionApi] {timeoutMsg}");
                _logger.LogWarning(timeoutMsg);
                return new CimmpleExtractionAttempt { Error = timeoutMsg };
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                var msg = $"api.extraction.cimmple.net call failed: {ex.Message}";
                Console.WriteLine($"[CimmpleExtractionApi] EXCEPTION: {msg}");
                _logger.LogWarning(ex, "Cimmple extraction API call failed.");
                return new CimmpleExtractionAttempt { Error = msg };
            }
        }

        internal static VendorQuotationExtractionDto? MapResponseToVendorQuotation(string responseText)
        {
            JToken root;
            try
            {
                root = JToken.Parse(responseText);
            }
            catch (JsonException)
            {
                return null;
            }

            if (root is JObject obj)
            {
                if (obj["error"] != null
                    && obj["result"] == null
                    && obj["data"] == null
                    && obj["vendorNames"] == null
                    && obj["lineItems"] == null
                    && obj["details"] == null
                    && obj["quotationNumber"] == null
                    && obj["issuerName"] == null)
                {
                    return null;
                }

                root = obj["result"] ?? obj["data"] ?? obj["extraction"] ?? obj["invoice"] ?? root;
            }

            if (root is JObject candidate
                && candidate["vendorNames"] is JArray
                && candidate["details"] is JArray
                && candidate["lineItems"] == null)
            {
                try
                {
                    var parsed = DocumentExtractionPrompts.ParseVendorQuotationJson(
                        candidate.ToString(Formatting.None));
                    // Bill To wins over company/letterhead for vendor name + billing.
                    DocumentExtractionPrompts.PreferBillToVendorAndBilling(parsed, candidate);
                    DocumentExtractionPrompts.EnrichAddressesFromNestedParties(parsed, candidate);
                    DocumentExtractionPrompts.EnrichDatesFromRaw(parsed, candidate);
                    DocumentExtractionPrompts.StripIssuerFromVendorNames(parsed, candidate);
                    return parsed;
                }
                catch (InvalidOperationException)
                {
                    // fall through
                }
            }

            return MapInvoiceLikeToVendorQuotation(root);
        }

        private static VendorQuotationExtractionDto MapInvoiceLikeToVendorQuotation(JToken root)
        {
            if (root is not JObject obj)
                return new VendorQuotationExtractionDto();

            var dto = new VendorQuotationExtractionDto
            {
                DocumentType = ReadString(obj, "documentType") ?? "vendorQuotation",
                QuotationNumber = FirstString(obj, "quotationNumber", "invoiceNumber", "documentNumber", "number", "poNumber"),
                QuotationDate = NormalizeDateString(
                    FirstString(obj, "quotationDate", "invoiceDate", "date", "orderDate", "documentDate")),
                DueDate = NormalizeDateString(
                    FirstString(obj, "dueDate", "paymentDueDate", "policyEndDate")),
                // Track letterhead/company so it can be stripped from vendor — do NOT use as vendor.
                CompanyName = FirstString(obj, "companyName", "issuerName", "preparedBy", "fromCompany", "documentCompany"),
                // Phone/email only from vendor* keys here; Bill To fills contact later.
                VendorPhone = FirstString(obj, "vendorPhone"),
                VendorEmail = FirstString(obj, "vendorEmail"),
                Material = FirstString(obj, "quotationType", "material"),
                ProjectName = FirstString(obj, "quotationTerms", "paymentTerms", "policyNumber"),
            };

            // Hosted API: vendor is Bill To / Ship To / Supplier — never letterhead issuer/companyName.
            if (obj["vendorNames"] is JArray namesArr)
            {
                foreach (var n in namesArr)
                {
                    var s = n?.ToString()?.Trim();
                    if (!string.IsNullOrWhiteSpace(s)
                        && !IsLikelyIssuerName(s!, obj))
                    {
                        AddVendorName(dto, s!);
                    }
                }
            }

            var billTo = obj["billTo"] as JObject;
            var shipTo = obj["shipTo"] as JObject;
            var soldTo = obj["soldTo"] as JObject;

            // Flat vendor* fields only — NEVER root "address"/"city"/"companyName" (letterhead).
            dto.VendorAddress ??= FirstString(obj, "vendorAddress", "billingAddress");
            dto.VendorApartment ??= FirstString(obj, "vendorApartment", "billingApartment");
            dto.VendorCity ??= FirstString(obj, "vendorCity", "billingCity");
            dto.VendorState ??= FirstString(obj, "vendorState", "billingState");
            dto.VendorZip ??= FirstString(obj, "vendorZip", "billingZip");
            dto.VendorCountry ??= FirstString(obj, "vendorCountry", "billingCountry");
            dto.VendorShippingAddress ??= FirstString(obj, "vendorShippingAddress", "shippingAddress");
            dto.VendorShippingApartment ??= FirstString(obj, "vendorShippingApartment", "shippingApartment");
            dto.VendorShippingCity ??= FirstString(obj, "vendorShippingCity", "shippingCity");
            dto.VendorShippingState ??= FirstString(obj, "vendorShippingState", "shippingState");
            dto.VendorShippingZip ??= FirstString(obj, "vendorShippingZip", "shippingZip", "shippingZipCode");
            dto.VendorShippingCountry ??= FirstString(obj, "vendorShippingCountry", "shippingCountry");
            dto.VendorContactName ??= FirstString(obj, "vendorContactName");
            dto.VendorPhone ??= FirstString(obj, "vendorPhone");
            dto.VendorEmail ??= FirstString(obj, "vendorEmail");

            // Bill To is authoritative for vendor name + billing (overwrites company/letterhead).
            DocumentExtractionPrompts.PreferBillToVendorAndBilling(dto, obj);
            ApplyBillingParty(dto, billTo);
            if (billTo == null)
                ApplyBillingParty(dto, soldTo);
            ApplyShippingParty(dto, shipTo);

            // Explicit vendor/supplier name only — never companyName / issuerName / clientName.
            var explicitVendor = FirstString(
                obj,
                "vendorName",
                "supplierName",
                "sellerName");
            if (!string.IsNullOrWhiteSpace(explicitVendor) && !IsLikelyIssuerName(explicitVendor!, obj))
                AddVendorName(dto, explicitVendor);

            var nestedVendor = obj["vendor"] as JObject
                ?? obj["supplier"] as JObject
                ?? obj["seller"] as JObject;
            // Only use nested vendor when it is NOT the document company/letterhead.
            if (nestedVendor != null && billTo == null)
            {
                var nestedName = FirstString(nestedVendor, "name", "companyName", "company", "vendorName");
                if (string.IsNullOrWhiteSpace(nestedName) || !IsLikelyIssuerName(nestedName!, obj))
                    ApplyBillingParty(dto, nestedVendor);
            }

            if (dto.VendorNames.Count == 0)
            {
                ApplyBillingParty(dto, billTo ?? soldTo);
            }

            DocumentExtractionPrompts.StripIssuerFromVendorNames(dto, obj);

            var lines = obj["lineItems"] as JArray
                ?? obj["details"] as JArray
                ?? obj["lines"] as JArray
                ?? obj["items"] as JArray;

            if (lines != null)
            {
                foreach (var lineToken in lines)
                {
                    if (lineToken is not JObject line)
                        continue;

                    var description = FirstString(
                        line,
                        "description",
                        "itemDescription",
                        "desc",
                        "productDescription",
                        "lineDescription");
                    var itemName = FirstString(
                        line,
                        "itemName",
                        "product",
                        "productName",
                        "name",
                        "partName");
                    // Notes = remarks/comments only — never reuse description/part text.
                    var notes = FirstString(line, "notes", "remark", "remarks", "comment", "comments");
                    if (!string.IsNullOrWhiteSpace(notes)
                        && ((!string.IsNullOrWhiteSpace(description)
                                && string.Equals(notes.Trim(), description.Trim(), StringComparison.OrdinalIgnoreCase))
                            || (!string.IsNullOrWhiteSpace(itemName)
                                && string.Equals(notes.Trim(), itemName.Trim(), StringComparison.OrdinalIgnoreCase))))
                    {
                        notes = null;
                    }

                    var discountAmount = FirstDecimal(line, "discountAmount", "discount_amount");
                    var discountPercent = FirstDecimal(
                        line,
                        "discountPercentage",
                        "discount_percentage",
                        "discountPercent");
                    decimal? discount = null;
                    string? discountType = null;
                    if (discountAmount.HasValue && discountAmount.Value != 0)
                    {
                        discount = discountAmount;
                        discountType = "Amount";
                    }
                    else if (discountPercent.HasValue && discountPercent.Value != 0)
                    {
                        discount = discountPercent;
                        discountType = "Percent";
                    }
                    else
                    {
                        var plainDiscount = FirstDecimal(line, "discount");
                        if (plainDiscount.HasValue && plainDiscount.Value != 0)
                        {
                            discount = plainDiscount;
                            discountType = plainDiscount.Value > 0 && plainDiscount.Value <= 100
                                ? "Percent"
                                : "Amount";
                        }
                    }

                    var detail = new VendorQuotationExtractionDetailDto
                    {
                        ItemName = itemName,
                        ItemDescription = description,
                        Quantity = FirstDecimal(line, "quantity", "qty", "qtyOrdered", "orderedQty", "orderQty"),
                        Unit = FirstString(line, "unit", "uom", "unitOfMeasure", "unitOfMeas") ?? "EA",
                        UnitPrice = FirstDecimal(
                            line,
                            "unitPrice",
                            "rate",
                            "price",
                            "unit_price",
                            "unitCost",
                            "each"),
                        Amount = FirstDecimal(
                            line,
                            "amount",
                            "total",
                            "lineTotal",
                            "totalPrice",
                            "extendedPrice",
                            "extPrice"),
                        Discount = discount,
                        DiscountType = discountType,
                        Notes = notes,
                    };

                    var partNo = FirstString(
                        line,
                        "partNumber",
                        "partNo",
                        "articleId",
                        "sku",
                        "itemCode",
                        "itemNumber",
                        "catalogNumber",
                        "catalogNo");
                    var jobNo = FirstString(line, "jobNo", "jobNumber", "job", "joNumber", "workOrder");

                    // If notes is only a job/JO ref, move it to jobNo and clear notes.
                    if (string.IsNullOrWhiteSpace(jobNo) && !string.IsNullOrWhiteSpace(notes))
                    {
                        var notesTrim = notes!.Trim();
                        if (System.Text.RegularExpressions.Regex.IsMatch(
                                notesTrim,
                                @"^(?:JO[#\-_\s]?\d+|#JO\d+|JOB[#\-_\s]?\w[\w\-]*)$",
                                System.Text.RegularExpressions.RegexOptions.IgnoreCase)
                            || System.Text.RegularExpressions.Regex.IsMatch(
                                notesTrim,
                                @"^(?:job|jo)\s*(?:no\.?|number|#)?\s*[:\-–]?\s*[A-Za-z0-9][\w\-\/]*$",
                                System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                        {
                            jobNo = notesTrim;
                            notes = null;
                            detail.Notes = null;
                        }
                    }

                    // PartNo that looks like a JO → treat as jobNo.
                    if (string.IsNullOrWhiteSpace(jobNo)
                        && !string.IsNullOrWhiteSpace(partNo)
                        && System.Text.RegularExpressions.Regex.IsMatch(
                            partNo!,
                            @"JO#|#JO|^JO\d|^JO[-_\s]",
                            System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                    {
                        jobNo = partNo;
                        partNo = null;
                    }

                    detail.Parts.Add(new VendorQuotationExtractionPartDto
                    {
                        PartNo = partNo,
                        JobNo = jobNo,
                        PartName = itemName ?? description,
                        Description = description,
                        Quantity = detail.Quantity,
                        Unit = detail.Unit,
                        // Do not copy line notes into remarks — avoids duplicate notes in the UI.
                        Remarks = null,
                    });

                    if (string.IsNullOrWhiteSpace(detail.ItemName)
                        && string.IsNullOrWhiteSpace(detail.ItemDescription)
                        && detail.Quantity == null
                        && detail.UnitPrice == null
                        && detail.Amount == null
                        && string.IsNullOrWhiteSpace(partNo))
                    {
                        continue;
                    }

                    dto.Details.Add(detail);
                }
            }

            // Final pass: nested address objects / alternate shipTo keys + date aliases.
            DocumentExtractionPrompts.EnrichAddressesFromNestedParties(dto, obj);
            DocumentExtractionPrompts.EnrichDatesFromRaw(dto, obj);
            return dto;
        }

        /// <summary>
        /// Copy name + contact + billing address from Bill To / Vendor / Sold To.
        /// </summary>
        private static void ApplyBillingParty(VendorQuotationExtractionDto dto, JObject? party)
        {
            if (party == null) return;

            DocumentExtractionPrompts.EnrichAddressesFromNestedParties(
                dto,
                new JObject { ["billTo"] = party });
        }

        /// <summary>
        /// Copy Ship To address only — never overwrite billing fields.
        /// </summary>
        private static void ApplyShippingParty(VendorQuotationExtractionDto dto, JObject? party)
        {
            if (party == null) return;

            // Name on Ship To can still identify vendor when Bill To was empty.
            AddVendorName(
                dto,
                FirstString(party, "name", "companyName", "company", "vendorName", "supplierName"));

            // Prefer shared nested-address enrichment (handles address objects + line arrays).
            DocumentExtractionPrompts.EnrichAddressesFromNestedParties(
                dto,
                new JObject { ["shipTo"] = party });
        }

        private static bool IsLikelyIssuerName(string candidate, JObject root)
        {
            var issuer = FirstString(
                root,
                "issuerName",
                "companyName",
                "preparedBy",
                "fromCompany",
                "documentCompany");
            return !string.IsNullOrWhiteSpace(issuer)
                && string.Equals(issuer.Trim(), candidate.Trim(), StringComparison.OrdinalIgnoreCase);
        }

        private static void AddVendorName(VendorQuotationExtractionDto dto, string? name)
        {
            var trimmed = name?.Trim();
            if (string.IsNullOrWhiteSpace(trimmed)) return;
            if (dto.VendorNames.Any(n =>
                    string.Equals(n, trimmed, StringComparison.OrdinalIgnoreCase)))
                return;
            dto.VendorNames.Add(trimmed!);
        }

        private static string? FirstNonEmpty(params string?[] values)
        {
            foreach (var v in values)
            {
                if (!string.IsNullOrWhiteSpace(v))
                    return v.Trim();
            }
            return null;
        }

        private static string? ReadString(JObject obj, string name)
        {
            var token = obj[name];
            if (token == null || token.Type == JTokenType.Null) return null;
            // Nested address objects/arrays are handled by EnrichAddressesFromNestedParties.
            if (token.Type == JTokenType.Object || token.Type == JTokenType.Array) return null;
            var s = token.Type == JTokenType.String ? token.Value<string>() : token.ToString();
            return string.IsNullOrWhiteSpace(s) ? null : s.Trim();
        }

        private static string? FirstString(JObject obj, params string[] names)
        {
            foreach (var name in names)
            {
                var value = ReadString(obj, name);
                if (!string.IsNullOrWhiteSpace(value))
                    return value;
            }
            return null;
        }

        private static decimal? FirstDecimal(JObject obj, params string[] names)
        {
            foreach (var name in names)
            {
                var token = obj[name];
                if (token == null || token.Type == JTokenType.Null) continue;
                if (token.Type == JTokenType.Float || token.Type == JTokenType.Integer)
                    return token.Value<decimal>();
                if (decimal.TryParse(token.ToString(), out var d))
                    return d;
            }
            return null;
        }

        private static string Truncate(string? text, int max)
        {
            if (string.IsNullOrEmpty(text)) return string.Empty;
            return text.Length <= max ? text : text.Substring(0, max) + "…";
        }

        private static string StripHtml(string? text)
        {
            if (string.IsNullOrWhiteSpace(text)) return string.Empty;
            if (text.IndexOf('<') < 0) return text.Trim();

            // Pull the IIS / ASP.NET error title when the host returns HTML (e.g. 500.31).
            var titleMatch = System.Text.RegularExpressions.Regex.Match(
                text,
                @"<title>\s*(.*?)\s*</title>",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase
                | System.Text.RegularExpressions.RegexOptions.Singleline);
            if (titleMatch.Success)
                return titleMatch.Groups[1].Value.Trim();

            var h1Match = System.Text.RegularExpressions.Regex.Match(
                text,
                @"<h1[^>]*>\s*(.*?)\s*</h1>",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase
                | System.Text.RegularExpressions.RegexOptions.Singleline);
            if (h1Match.Success)
                return System.Text.RegularExpressions.Regex.Replace(
                    h1Match.Groups[1].Value, "<.*?>", string.Empty).Trim();

            return System.Text.RegularExpressions.Regex.Replace(text, "<.*?>", " ").Trim();
        }

        private static string? NormalizeDateString(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var trimmed = value.Trim();
            if (trimmed.Length >= 10
                && trimmed[4] == '-'
                && trimmed[7] == '-'
                && int.TryParse(trimmed.AsSpan(0, 4), out _)
                && int.TryParse(trimmed.AsSpan(5, 2), out _)
                && int.TryParse(trimmed.AsSpan(8, 2), out _))
            {
                return trimmed.Substring(0, 10);
            }

            if (DateTime.TryParse(
                    trimmed,
                    System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.AllowWhiteSpaces,
                    out var parsed)
                || DateTime.TryParse(trimmed, out parsed))
            {
                return parsed.ToString("yyyy-MM-dd");
            }

            return trimmed;
        }
    }
}
