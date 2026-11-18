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
                    return DocumentExtractionPrompts.ParseVendorQuotationJson(candidate.ToString(Formatting.None));
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
                VendorPhone = FirstString(obj, "vendorPhone", "phone"),
                VendorEmail = FirstString(obj, "vendorEmail", "email"),
                Material = FirstString(obj, "quotationType", "material"),
                ProjectName = FirstString(obj, "quotationTerms", "paymentTerms", "policyNumber"),
            };

            // Hosted API: vendor is billTo / shipTo (not issuerName).
            if (obj["vendorNames"] is JArray namesArr)
            {
                foreach (var n in namesArr)
                {
                    var s = n?.ToString()?.Trim();
                    if (!string.IsNullOrWhiteSpace(s))
                        AddVendorName(dto, s!);
                }
            }

            var billTo = obj["billTo"] as JObject;
            var shipTo = obj["shipTo"] as JObject;
            if (billTo != null)
                AddVendorName(dto, FirstString(billTo, "name", "companyName", "company", "vendorName"));
            if (shipTo != null)
                AddVendorName(dto, FirstString(shipTo, "name", "companyName", "company", "vendorName"));

            AddVendorName(
                dto,
                FirstString(
                    obj,
                    "vendorName",
                    "supplierName",
                    "supplier",
                    "sellerName",
                    "seller"));

            var nestedVendor = obj["vendor"] as JObject
                ?? obj["supplier"] as JObject
                ?? obj["seller"] as JObject;
            if (nestedVendor != null)
            {
                AddVendorName(dto, FirstString(nestedVendor, "name", "companyName", "company"));
                dto.VendorPhone ??= FirstString(nestedVendor, "phone");
                dto.VendorEmail ??= FirstString(nestedVendor, "email");
            }

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

                    var description = FirstString(line, "description", "itemDescription", "desc");
                    var itemName = FirstString(line, "itemName", "product", "name", "partName")
                        ?? description;
                    // Keep notes as document notes only — never append discount here.
                    var notes = FirstString(line, "notes", "remark", "remarks");

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
                        Quantity = FirstDecimal(line, "quantity", "qty", "qtyOrdered"),
                        Unit = FirstString(line, "unit", "uom", "unitOfMeasure") ?? "EA",
                        UnitPrice = FirstDecimal(line, "unitPrice", "rate", "price", "unit_price"),
                        Amount = FirstDecimal(line, "amount", "total", "lineTotal", "totalPrice"),
                        Discount = discount,
                        DiscountType = discountType,
                        Notes = notes,
                    };

                    var partNo = FirstString(line, "partNumber", "partNo", "articleId", "sku", "itemCode");
                    var jobNo = FirstString(line, "jobNo", "jobNumber");
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
                        && string.IsNullOrWhiteSpace(partNo))
                    {
                        continue;
                    }

                    dto.Details.Add(detail);
                }
            }

            return dto;
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
