using System;
using System.Collections.Generic;
using System.Linq;
using CimmpleAPI.Data.Dtos;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;

namespace CimmpleAPI.Services.DocumentExtraction
{
    /// <summary>
    /// Document extraction kinds (shared core prompt + thin kind overlay).
    /// </summary>
    public static class DocumentExtractionKinds
    {
        public const string VendorQuotation = "vendorQuotation";
        public const string VendorOrder = "vendorOrder";
        public const string CustomerQuotation = "customerQuotation";
        public const string CustomerOrder = "customerOrder";

        public static bool IsKnown(string? kind) =>
            string.Equals(kind, VendorQuotation, StringComparison.OrdinalIgnoreCase)
            || string.Equals(kind, VendorOrder, StringComparison.OrdinalIgnoreCase)
            || string.Equals(kind, CustomerQuotation, StringComparison.OrdinalIgnoreCase)
            || string.Equals(kind, CustomerOrder, StringComparison.OrdinalIgnoreCase);

        public static string Normalize(string? kind) =>
            string.IsNullOrWhiteSpace(kind) ? VendorQuotation : kind.Trim();

        public static bool IsVendorParty(string? kind)
        {
            var k = Normalize(kind);
            return string.Equals(k, VendorQuotation, StringComparison.OrdinalIgnoreCase)
                || string.Equals(k, VendorOrder, StringComparison.OrdinalIgnoreCase);
        }

        public static bool IsCustomerParty(string? kind) => !IsVendorParty(kind);
    }

    public static class DocumentExtractionPrompts
    {
        /// <summary>Shared line/date/address schema (identical for all kinds — keeps parsers stable).</summary>
        private const string SharedSchemaJson =
            @"{""documentType"":string,""quotationNumber"":string,""quotationDate"":string,""dueDate"":string,""projectName"":string,""material"":string,""vendorNames"":[string],""vendorContactName"":string,""vendorPhone"":string,""vendorEmail"":string,""billTo"":{""name"":string,""address"":string,""apartment"":string,""city"":string,""state"":string,""zip"":string,""country"":string,""contactName"":string,""phone"":string,""email"":string},""shipTo"":{""name"":string,""address"":string,""apartment"":string,""city"":string,""state"":string,""zip"":string,""country"":string},""vendorAddress"":string,""vendorApartment"":string,""vendorCity"":string,""vendorState"":string,""vendorZip"":string,""vendorCountry"":string,""vendorShippingAddress"":string,""vendorShippingApartment"":string,""vendorShippingCity"":string,""vendorShippingState"":string,""vendorShippingZip"":string,""vendorShippingCountry"":string,""details"":[{""itemName"":string,""itemDescription"":string,""quantity"":number,""unit"":string,""unitPrice"":number,""amount"":number,""discount"":number,""discountType"":string,""notes"":string,""parts"":[{""partNo"":string,""jobNo"":string,""partName"":string,""description"":string,""material"":string,""quantity"":number,""unit"":string,""remarks"":string}]}]}";

        private const string SharedCoreRules = @"Return ONLY JSON (no markdown). null if missing. Dates yyyy-MM-dd. Do not invent values.

DATES:
- quotationDate = document/quote/order/invoice date as yyyy-MM-dd when present.
- dueDate = Due/Valid-until/Expiry as yyyy-MM-dd when present; else null.

ADDRESSES:
- billTo = Bill To / Sold To block ONLY. shipTo = Ship To ONLY. NEVER copy billTo into shipTo.
- Mirror billTo → vendorAddress* + vendorContactName/vendorPhone/vendorEmail.
- Mirror shipTo → vendorShipping* fields.
- companyName / letterhead / logo / issuer / Prepared-by = DOCUMENT OWNER — never use as party name or billing address.

LINE ITEMS:
- Exactly one details[] object per PDF table row. Never split one row.
- quantity/unitPrice/amount numbers only; unit default EA.
- partNo = Part No/SKU/Item # only. jobNo = Job/JO only (never in notes).
- notes = Comments/Remarks only — never partNo, jobNo, or description.
- parts[] only for the same row.
";

        private const string VendorPartyOverlay = @"
PARTY (vendor document):
- vendorNames = Bill To / Vendor / Supplier / Seller party name. Prefer billTo.name. NEVER companyName/letterhead.
- quotationNumber = Quote/RFQ/PO/document number when present.
";

        private const string VendorOrderOverlay = @"
PARTY (vendor purchase order / vendor order):
- vendorNames = Vendor / Supplier / Seller / Bill To party. Prefer billTo.name. NEVER companyName/letterhead.
- quotationNumber = Vendor PO / PO / Order / Quote reference when present.
- quotationDate = Order / PO date.
";

        private const string CustomerPartyOverlay = @"
PARTY (customer document):
- vendorNames = CUSTOMER party only (Bill To / Sold To / Customer / Buyer). Prefer billTo.name.
- NEVER put seller / vendor / letterhead / companyName into vendorNames.
- quotationNumber = Customer quote / RFQ / document number when present.
";

        private const string CustomerOrderOverlay = @"
PARTY (customer order / customer PO):
- vendorNames = CUSTOMER party only (Bill To / Sold To / Customer / Buyer / Ship To customer). Prefer billTo.name.
- NEVER put seller / vendor / letterhead / companyName into vendorNames.
- quotationNumber = Customer PO / Order / document number when present.
- quotationDate = Order / PO date.
";

        /// <summary>Backward-compatible full VQ prompt (core + vendor overlay + schema).</summary>
        public static string VendorQuotationExtractionPrompt =>
            ResolvePrompt(DocumentExtractionKinds.VendorQuotation);

        public static string ResolvePrompt(string documentKind)
        {
            var kind = DocumentExtractionKinds.Normalize(documentKind);
            string overlay;
            if (string.Equals(kind, DocumentExtractionKinds.VendorOrder, StringComparison.OrdinalIgnoreCase))
                overlay = VendorOrderOverlay;
            else if (string.Equals(kind, DocumentExtractionKinds.CustomerQuotation, StringComparison.OrdinalIgnoreCase))
                overlay = CustomerPartyOverlay;
            else if (string.Equals(kind, DocumentExtractionKinds.CustomerOrder, StringComparison.OrdinalIgnoreCase))
                overlay = CustomerOrderOverlay;
            else if (string.Equals(kind, DocumentExtractionKinds.VendorQuotation, StringComparison.OrdinalIgnoreCase))
                overlay = VendorPartyOverlay;
            else
                throw new InvalidOperationException($"Unsupported document extraction kind: {documentKind}");

            return SharedCoreRules + overlay + "\n" + SharedSchemaJson;
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

                static bool SameText(string? a, string? b) =>
                    !string.IsNullOrWhiteSpace(a)
                    && !string.IsNullOrWhiteSpace(b)
                    && string.Equals(a.Trim(), b.Trim(), StringComparison.OrdinalIgnoreCase);

                foreach (var detail in dto.Details)
                {
                    detail.Parts ??= new List<VendorQuotationExtractionPartDto>();

                    // Keep notes distinct from part/description — drop exact duplicates.
                    if (!string.IsNullOrWhiteSpace(detail.Notes)
                        && (SameText(detail.Notes, detail.ItemDescription)
                            || SameText(detail.Notes, detail.ItemName)
                            || detail.Parts.Any(p =>
                                SameText(detail.Notes, p.PartName)
                                || SameText(detail.Notes, p.Description)
                                || SameText(detail.Notes, p.PartNo))))
                    {
                        detail.Notes = null;
                    }

                    // Job/JO text in notes → parts[].jobNo (never leave in notes).
                    static bool LooksLikeJob(string? value) =>
                        !string.IsNullOrWhiteSpace(value)
                        && (value!.IndexOf("JO#", StringComparison.OrdinalIgnoreCase) >= 0
                            || System.Text.RegularExpressions.Regex.IsMatch(
                                value.Trim(),
                                @"^(?:JO[#\-_\s]?\d+|#JO\d+|JOB[#\-_\s]?\w[\w\-]*)$",
                                System.Text.RegularExpressions.RegexOptions.IgnoreCase)
                            || System.Text.RegularExpressions.Regex.IsMatch(
                                value.Trim(),
                                @"^(?:job|jo)\s*(?:no\.?|number|#)?\s*[:\-–]?\s*[A-Za-z0-9]",
                                System.Text.RegularExpressions.RegexOptions.IgnoreCase));

                    if (LooksLikeJob(detail.Notes))
                    {
                        var jobText = detail.Notes!.Trim();
                        detail.Notes = null;
                        if (detail.Parts.Count == 0)
                        {
                            detail.Parts.Add(new VendorQuotationExtractionPartDto { JobNo = jobText });
                        }
                        else if (string.IsNullOrWhiteSpace(detail.Parts[0].JobNo))
                        {
                            detail.Parts[0].JobNo = jobText;
                        }
                    }

                    foreach (var part in detail.Parts)
                    {
                        if (!string.IsNullOrWhiteSpace(part.Remarks)
                            && (SameText(part.Remarks, part.PartName)
                                || SameText(part.Remarks, part.Description)
                                || SameText(part.Remarks, part.PartNo)
                                || SameText(part.Remarks, detail.ItemDescription)
                                || SameText(part.Remarks, detail.ItemName)
                                || LooksLikeJob(part.Remarks)))
                        {
                            if (LooksLikeJob(part.Remarks) && string.IsNullOrWhiteSpace(part.JobNo))
                            {
                                part.JobNo = part.Remarks!.Trim();
                            }
                            part.Remarks = null;
                        }

                        if (LooksLikeJob(part.PartNo) && string.IsNullOrWhiteSpace(part.JobNo))
                        {
                            part.JobNo = part.PartNo!.Trim();
                            part.PartNo = null;
                        }
                    }
                }

                // Nested billTo/shipTo are not DTO properties — merge them from raw JSON.
                try
                {
                    var root = JToken.Parse(jsonText) as JObject;
                    if (root != null)
                    {
                        // Bill To overwrites any company/letterhead address the model put in flat fields.
                        PreferBillToVendorAndBilling(dto, root);
                        EnrichAddressesFromNestedParties(dto, root);
                        EnrichDatesFromRaw(dto, root);
                        StripIssuerFromVendorNames(dto, root);
                    }
                    else
                    {
                        StripIssuerFromVendorNames(dto, null);
                    }
                }
                catch (JsonException)
                {
                    StripIssuerFromVendorNames(dto, null);
                }

                return dto;
            }
            catch (JsonException ex)
            {
                throw new InvalidOperationException($"Failed to parse vendor quotation JSON: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// Fill quotation/due dates from alternate JSON keys when quotationDate was omitted.
        /// </summary>
        public static void EnrichDatesFromRaw(VendorQuotationExtractionDto dto, JObject root)
        {
            if (dto == null || root == null) return;

            static string? PickDate(JObject obj, params string[] names)
            {
                foreach (var name in names)
                {
                    var token = obj[name];
                    if (token == null || token.Type == JTokenType.Null) continue;
                    if (token.Type == JTokenType.Object || token.Type == JTokenType.Array) continue;
                    var s = token.Type == JTokenType.String ? token.Value<string>() : token.ToString();
                    if (string.IsNullOrWhiteSpace(s)) continue;
                    var trimmed = s!.Trim();
                    if (trimmed.Length >= 10
                        && trimmed[4] == '-'
                        && trimmed[7] == '-')
                        return trimmed.Substring(0, 10);
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
                return null;
            }

            dto.QuotationDate ??= PickDate(
                root,
                "quotationDate",
                "quoteDate",
                "invoiceDate",
                "orderDate",
                "documentDate",
                "date",
                "drawingDate");
            dto.DueDate ??= PickDate(
                root,
                "dueDate",
                "paymentDueDate",
                "validUntil",
                "expiryDate",
                "expirationDate");
        }

        /// <summary>
        /// Remove letterhead/companyName/issuer from vendorNames. Prefer billTo.name.
        /// </summary>
        public static void StripIssuerFromVendorNames(VendorQuotationExtractionDto dto, JObject? root)
        {
            if (dto == null) return;

            var issuerCandidates = new List<string?>
            {
                dto.CompanyName,
                dto.ClientName,
                dto.DrawnBy
            };
            if (root != null)
            {
                issuerCandidates.Add(ReadPartyString(root, "companyName", "issuerName", "preparedBy", "fromCompany", "documentCompany", "letterhead"));
            }

            dto.VendorNames = (dto.VendorNames ?? new List<string>())
                .Where(n => !string.IsNullOrWhiteSpace(n))
                .Select(n => n.Trim())
                .Where(n => !issuerCandidates.Any(issuer =>
                    !string.IsNullOrWhiteSpace(issuer)
                    && string.Equals(issuer!.Trim(), n, StringComparison.OrdinalIgnoreCase)))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            // If billTo.name exists, put it first (authoritative vendor name).
            if (root?["billTo"] is JObject billTo)
            {
                var billName = ReadPartyString(billTo, "name", "companyName", "company", "vendorName");
                if (!string.IsNullOrWhiteSpace(billName)
                    && !issuerCandidates.Any(issuer =>
                        !string.IsNullOrWhiteSpace(issuer)
                        && string.Equals(issuer!.Trim(), billName, StringComparison.OrdinalIgnoreCase)))
                {
                    dto.VendorNames.RemoveAll(n =>
                        string.Equals(n, billName, StringComparison.OrdinalIgnoreCase));
                    dto.VendorNames.Insert(0, billName!);
                }
            }
        }

        /// <summary>
        /// When Bill To exists, overwrite vendor name + billing address from Bill To
        /// (never keep company/letterhead address that may already be in flat fields).
        /// </summary>
        public static void PreferBillToVendorAndBilling(VendorQuotationExtractionDto dto, JObject root)
        {
            if (dto == null || root == null) return;

            var billTo = root["billTo"] as JObject ?? root["soldTo"] as JObject;
            if (billTo == null) return;

            var billName = ReadPartyString(billTo, "name", "companyName", "company", "vendorName");
            var issuer = ReadPartyString(root, "companyName", "issuerName", "preparedBy", "fromCompany", "documentCompany")
                ?? dto.CompanyName;

            // Clear vendor names that are really the document company.
            if (!string.IsNullOrWhiteSpace(issuer))
            {
                dto.VendorNames.RemoveAll(n =>
                    string.Equals(n, issuer!.Trim(), StringComparison.OrdinalIgnoreCase));
            }

            if (!string.IsNullOrWhiteSpace(billName)
                && (string.IsNullOrWhiteSpace(issuer)
                    || !string.Equals(billName, issuer.Trim(), StringComparison.OrdinalIgnoreCase)))
            {
                dto.VendorNames.RemoveAll(n =>
                    string.Equals(n, billName, StringComparison.OrdinalIgnoreCase));
                dto.VendorNames.Insert(0, billName!);
            }

            // Overwrite billing from Bill To (force replace — do not keep company address).
            ApplyPartyToBilling(dto, billTo, overwrite: true);
        }

        /// <summary>
        /// Fill billing/shipping from nested billTo/shipTo (and nested address objects).
        /// Never copies billing into shipping. Never uses company/letterhead as billing.
        /// </summary>
        public static void EnrichAddressesFromNestedParties(VendorQuotationExtractionDto dto, JObject root)
        {
            if (dto == null || root == null) return;

            // Bill To / Sold To only for billing — do NOT use company / issuer / letterhead objects.
            ApplyPartyToBilling(dto, root["billTo"] as JObject, overwrite: true);
            if (root["billTo"] == null)
                ApplyPartyToBilling(dto, root["soldTo"] as JObject, overwrite: false);

            // Nested vendor/supplier only if it is not the same as companyName.
            var nestedVendor = root["vendor"] as JObject
                ?? root["supplier"] as JObject
                ?? root["seller"] as JObject;
            if (nestedVendor != null)
            {
                var nestedName = ReadPartyString(nestedVendor, "name", "companyName", "company", "vendorName");
                var company = ReadPartyString(root, "companyName", "issuerName") ?? dto.CompanyName;
                var isCompany = !string.IsNullOrWhiteSpace(nestedName)
                    && !string.IsNullOrWhiteSpace(company)
                    && string.Equals(nestedName!.Trim(), company!.Trim(), StringComparison.OrdinalIgnoreCase);
                if (!isCompany && root["billTo"] == null)
                    ApplyPartyToBilling(dto, nestedVendor, overwrite: false);
            }

            ApplyPartyToShipping(dto, root["shipTo"] as JObject);
            ApplyPartyToShipping(dto, root["shipping"] as JObject);
            ApplyPartyToShipping(dto, root["deliverTo"] as JObject);

            // Flat shipping aliases only (never root "address"/"city" — those are often company).
            dto.VendorShippingAddress ??= ReadPartyString(root, "vendorShippingAddress", "shippingAddress");
            dto.VendorShippingApartment ??= ReadPartyString(root, "vendorShippingApartment", "shippingApartment");
            dto.VendorShippingCity ??= ReadPartyString(root, "vendorShippingCity", "shippingCity");
            dto.VendorShippingState ??= ReadPartyString(root, "vendorShippingState", "shippingState");
            dto.VendorShippingZip ??= ReadPartyString(root, "vendorShippingZip", "shippingZip", "shippingZipCode");
            dto.VendorShippingCountry ??= ReadPartyString(root, "vendorShippingCountry", "shippingCountry");
        }

        private static void ApplyPartyToBilling(VendorQuotationExtractionDto dto, JObject? party, bool overwrite = false)
        {
            if (party == null) return;

            var name = ReadPartyString(party, "name", "companyName", "company", "vendorName");
            if (!string.IsNullOrWhiteSpace(name)
                && !dto.VendorNames.Any(n => string.Equals(n, name, StringComparison.OrdinalIgnoreCase)))
            {
                if (overwrite)
                    dto.VendorNames.Insert(0, name!);
                else
                    dto.VendorNames.Add(name!);
            }

            // Contact — overwrite when Bill To is authoritative.
            var contact = ReadPartyString(party, "contactName", "contact", "attention", "attn", "contactPerson");
            var phone = ReadPartyString(party, "phone", "phoneNumber", "tel", "telephone", "mobile");
            var email = ReadPartyString(party, "email", "emailAddress", "eMail");
            if (overwrite)
            {
                if (!string.IsNullOrWhiteSpace(contact)) dto.VendorContactName = contact;
                if (!string.IsNullOrWhiteSpace(phone)) dto.VendorPhone = phone;
                if (!string.IsNullOrWhiteSpace(email)) dto.VendorEmail = email;
            }
            else
            {
                dto.VendorContactName ??= contact;
                dto.VendorPhone ??= phone;
                dto.VendorEmail ??= email;
            }

            FillAddress(
                party,
                street: v =>
                {
                    if (overwrite || string.IsNullOrWhiteSpace(dto.VendorAddress)) dto.VendorAddress = v;
                },
                apt: v =>
                {
                    if (overwrite || string.IsNullOrWhiteSpace(dto.VendorApartment)) dto.VendorApartment = v;
                },
                city: v =>
                {
                    if (overwrite || string.IsNullOrWhiteSpace(dto.VendorCity)) dto.VendorCity = v;
                },
                state: v =>
                {
                    if (overwrite || string.IsNullOrWhiteSpace(dto.VendorState)) dto.VendorState = v;
                },
                zip: v =>
                {
                    if (overwrite || string.IsNullOrWhiteSpace(dto.VendorZip)) dto.VendorZip = v;
                },
                country: v =>
                {
                    if (overwrite || string.IsNullOrWhiteSpace(dto.VendorCountry)) dto.VendorCountry = v;
                });
        }

        private static void ApplyPartyToShipping(VendorQuotationExtractionDto dto, JObject? party)
        {
            if (party == null) return;

            FillAddress(
                party,
                street: v => dto.VendorShippingAddress ??= v,
                apt: v => dto.VendorShippingApartment ??= v,
                city: v => dto.VendorShippingCity ??= v,
                state: v => dto.VendorShippingState ??= v,
                zip: v => dto.VendorShippingZip ??= v,
                country: v => dto.VendorShippingCountry ??= v);
        }

        private static void FillAddress(
            JObject party,
            Action<string> street,
            Action<string> apt,
            Action<string> city,
            Action<string> state,
            Action<string> zip,
            Action<string> country)
        {
            // Nested address object: { street, city, state, zip, ... }
            var nested = party["address"] as JObject
                ?? party["Address"] as JObject
                ?? party["mailingAddress"] as JObject;

            JObject source = nested ?? party;

            var streetVal = ReadPartyString(
                source,
                "address", "address1", "addressLine1", "street", "streetAddress", "line1", "addr1");
            // When party.address is a plain string (not object), ReadPartyString on party works:
            if (nested == null)
            {
                streetVal ??= ReadPartyString(party, "address", "address1", "addressLine1", "street", "streetAddress", "line1", "addr1", "fullAddress");
            }
            else
            {
                // Prefer street from nested; avoid dumping whole object.
                streetVal ??= ReadPartyString(nested, "street", "streetAddress", "line1", "address1", "addressLine1");
            }

            // Address as string array of lines
            if (string.IsNullOrWhiteSpace(streetVal) && party["address"] is JArray lines)
            {
                streetVal = string.Join(", ", lines
                    .Select(t => t?.ToString()?.Trim())
                    .Where(s => !string.IsNullOrWhiteSpace(s))!);
            }

            if (!string.IsNullOrWhiteSpace(streetVal)) street(streetVal!);

            var aptVal = ReadPartyString(source, "address2", "addressLine2", "apartment", "suite", "line2", "addr2")
                ?? (nested == null ? null : ReadPartyString(party, "apartment", "suite", "address2"));
            if (!string.IsNullOrWhiteSpace(aptVal)) apt(aptVal!);

            var cityVal = ReadPartyString(source, "city", "town")
                ?? ReadPartyString(party, "city", "town");
            if (!string.IsNullOrWhiteSpace(cityVal)) city(cityVal!);

            var stateVal = ReadPartyString(source, "state", "province", "region", "stateCode")
                ?? ReadPartyString(party, "state", "province", "region", "stateCode");
            if (!string.IsNullOrWhiteSpace(stateVal)) state(stateVal!);

            var zipVal = ReadPartyString(source, "zip", "zipCode", "postalCode", "postal", "zipcode")
                ?? ReadPartyString(party, "zip", "zipCode", "postalCode", "postal", "zipcode");
            if (!string.IsNullOrWhiteSpace(zipVal)) zip(zipVal!);

            var countryVal = ReadPartyString(source, "country", "countryCode")
                ?? ReadPartyString(party, "country", "countryCode");
            if (!string.IsNullOrWhiteSpace(countryVal)) country(countryVal!);
        }

        private static string? ReadPartyString(JObject obj, params string[] names)
        {
            foreach (var name in names)
            {
                var token = obj[name];
                if (token == null || token.Type == JTokenType.Null) continue;
                // Skip nested objects/arrays here — handled by FillAddress.
                if (token.Type == JTokenType.Object || token.Type == JTokenType.Array) continue;
                var s = token.Type == JTokenType.String ? token.Value<string>() : token.ToString();
                if (!string.IsNullOrWhiteSpace(s)) return s.Trim();
            }
            return null;
        }
    }
}
