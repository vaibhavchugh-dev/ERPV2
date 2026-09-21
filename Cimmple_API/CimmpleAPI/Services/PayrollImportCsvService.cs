using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Parses payroll summary/detail CSVs into aggregated <see cref="ManualPayrollAmounts"/>.
    /// Detail rows are summed; known header aliases map to bucket keys.
    /// </summary>
    public static class PayrollImportCsvService
    {
        public static readonly string[] BucketKeys =
        {
            "grossWages",
            "federalTax",
            "stateTax",
            "localTax",
            "socialSecurityTax",
            "medicareTax",
            "preTaxDeductions",
            "retirementDeductions",
            "postTaxDeductions",
            "garnishments",
            "netPay",
            "employerTaxesBenefits"
        };

        private static readonly Dictionary<string, string[]> Aliases = new(StringComparer.OrdinalIgnoreCase)
        {
            ["grossWages"] = new[]
            {
                "grosswages", "grosspay", "gross", "totalgross", "totalgrosspay", "earnings", "totalearnings"
            },
            ["federalTax"] = new[]
            {
                "federaltax", "federalwithholding", "federal", "fit", "fedtax", "usfederal"
            },
            ["stateTax"] = new[]
            {
                "statetax", "statewithholding", "state", "sit", "sttax"
            },
            ["localTax"] = new[]
            {
                "localtax", "localwithholding", "local", "citytax", "municipaltax"
            },
            ["socialSecurityTax"] = new[]
            {
                "socialsecuritytax", "socialsecurity", "ss", "oasdi", "ficalss", "ee_ss", "eess"
            },
            ["medicareTax"] = new[]
            {
                "medicaretax", "medicare", "ee_medicare", "eemedicare", "med"
            },
            ["preTaxDeductions"] = new[]
            {
                "pretaxdeductions", "pretax", "pre_tax", "section125", "cafeteria", "benefitspretax"
            },
            ["retirementDeductions"] = new[]
            {
                "retirementdeductions", "retirement", "401k", "403b", "roth401k", "pension", "deferrals"
            },
            ["postTaxDeductions"] = new[]
            {
                "posttaxdeductions", "posttax", "post_tax", "aftertax", "aftertaxdeductions"
            },
            ["garnishments"] = new[]
            {
                "garnishments", "garnishment", "childsupport", "levy", "wagegarnishment"
            },
            ["netPay"] = new[]
            {
                "netpay", "net", "netcheck", "directdeposit", "takehomepay", "netearnings"
            },
            ["employerTaxesBenefits"] = new[]
            {
                "employertaxesbenefits", "employertaxes", "employerbenefits", "erfica", "erfuta",
                "ersuta", "employerpayrolltax", "companytaxes", "employercontributions"
            },
            ["payDate"] = new[] { "paydate", "checkdate", "paymentdate", "payday" },
            ["payPeriodStart"] = new[] { "payperiodstart", "periodstart", "startdate", "fromdate" },
            ["payPeriodEnd"] = new[] { "payperiodend", "periodend", "enddate", "todate" },
            ["externalRunId"] = new[] { "externalrunid", "runid", "batchid", "payrollid", "providerrunid" }
        };

        public static PayrollImportParseResult Parse(
            string csvText,
            Dictionary<string, string>? columnMapping = null)
        {
            if (string.IsNullOrWhiteSpace(csvText))
                throw new InvalidOperationException("CSV content is empty.");

            var normalized = csvText.TrimStart('\uFEFF');
            var rows = ParseCsv(normalized);
            if (rows.Count < 2)
                throw new InvalidOperationException("CSV must include a header row and at least one data row.");

            var headers = rows[0].Select(h => h.Trim()).ToList();
            var fileHash = ComputeSha256Hex(normalized);
            var suggested = SuggestMapping(headers);
            var mapping = MergeMapping(headers, suggested, columnMapping);

            var amounts = new ManualPayrollAmounts();
            DateTime? payDate = null, periodStart = null, periodEnd = null;
            string? externalRunId = null;
            var rowCount = 0;
            var warnings = new List<string>();

            for (var r = 1; r < rows.Count; r++)
            {
                var cols = rows[r];
                if (cols.All(string.IsNullOrWhiteSpace))
                    continue;

                rowCount++;
                for (var c = 0; c < headers.Count; c++)
                {
                    if (!mapping.TryGetValue(headers[c], out var bucket) || string.IsNullOrWhiteSpace(bucket))
                        continue;
                    if (bucket.Equals("ignore", StringComparison.OrdinalIgnoreCase) || bucket == "_")
                        continue;

                    var raw = c < cols.Length ? cols[c] : "";
                    if (string.IsNullOrWhiteSpace(raw))
                        continue;

                    switch (bucket)
                    {
                        case "payDate":
                            if (!payDate.HasValue && TryParseDate(raw, out var pd)) payDate = pd;
                            break;
                        case "payPeriodStart":
                            if (!periodStart.HasValue && TryParseDate(raw, out var ps)) periodStart = ps;
                            break;
                        case "payPeriodEnd":
                            if (!periodEnd.HasValue && TryParseDate(raw, out var pe)) periodEnd = pe;
                            break;
                        case "externalRunId":
                            if (string.IsNullOrWhiteSpace(externalRunId))
                                externalRunId = raw.Trim();
                            break;
                        default:
                            if (BucketKeys.Contains(bucket, StringComparer.OrdinalIgnoreCase))
                            {
                                if (TryParseMoney(raw, out var money))
                                    AddAmount(amounts, bucket, money);
                                else
                                    warnings.Add($"Row {r + 1}: could not parse amount '{raw}' for {bucket}.");
                            }
                            break;
                    }
                }
            }

            if (rowCount == 0)
                throw new InvalidOperationException("CSV has no data rows.");

            var mappedBuckets = mapping.Values
                .Where(v => !string.IsNullOrWhiteSpace(v)
                            && !v.Equals("ignore", StringComparison.OrdinalIgnoreCase)
                            && BucketKeys.Contains(v, StringComparer.OrdinalIgnoreCase))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (mappedBuckets.Count == 0)
                warnings.Add("No amount columns mapped. Map at least Gross wages (and usually Net pay).");

            if (amounts.GrossWages <= 0 && amounts.NetPay <= 0)
                warnings.Add("Aggregated gross and net are both zero — check column mapping.");

            return new PayrollImportParseResult
            {
                Headers = headers,
                SuggestedMapping = suggested,
                AppliedMapping = mapping,
                RowCount = rowCount,
                FileHash = fileHash,
                Amounts = amounts,
                PayDate = payDate,
                PayPeriodStart = periodStart,
                PayPeriodEnd = periodEnd,
                ExternalRunIdFromCsv = externalRunId,
                DefaultExternalRunId = string.IsNullOrWhiteSpace(externalRunId)
                    ? $"IMPORT-{fileHash[..16]}"
                    : externalRunId.Trim(),
                Warnings = warnings
            };
        }

        public static string BuildTemplateCsv()
        {
            var header = string.Join(",", new[]
            {
                "Employee",
                "Gross Pay",
                "Federal Tax",
                "State Tax",
                "Local Tax",
                "Social Security",
                "Medicare",
                "Pre-Tax Deductions",
                "Retirement",
                "Post-Tax Deductions",
                "Garnishments",
                "Net Pay",
                "Employer Taxes",
                "Pay Date",
                "Period Start",
                "Period End",
                "Run Id"
            });
            var sample = string.Join(",", new[]
            {
                "Jane Doe",
                "5000.00",
                "600.00",
                "200.00",
                "0",
                "310.00",
                "72.50",
                "100.00",
                "250.00",
                "50.00",
                "0",
                "3417.50",
                "450.00",
                "2026-03-20",
                "2026-03-01",
                "2026-03-15",
                "ADP-2026-W12"
            });
            return header + "\r\n" + sample + "\r\n";
        }

        private static void AddAmount(ManualPayrollAmounts a, string bucket, decimal money)
        {
            money = Math.Abs(money); // treat parentheses/negatives as absolute contribution
            switch (bucket)
            {
                case "grossWages": a.GrossWages += money; break;
                case "federalTax": a.FederalTax += money; break;
                case "stateTax": a.StateTax += money; break;
                case "localTax": a.LocalTax += money; break;
                case "socialSecurityTax": a.SocialSecurityTax += money; break;
                case "medicareTax": a.MedicareTax += money; break;
                case "preTaxDeductions": a.PreTaxDeductions += money; break;
                case "retirementDeductions": a.RetirementDeductions += money; break;
                case "postTaxDeductions": a.PostTaxDeductions += money; break;
                case "garnishments": a.Garnishments += money; break;
                case "netPay": a.NetPay += money; break;
                case "employerTaxesBenefits": a.EmployerTaxesBenefits += money; break;
            }
        }

        private static Dictionary<string, string> SuggestMapping(List<string> headers)
        {
            var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var header in headers)
            {
                var norm = NormalizeHeader(header);
                string? matched = null;
                foreach (var kv in Aliases)
                {
                    if (kv.Value.Any(a => a == norm))
                    {
                        matched = kv.Key;
                        break;
                    }
                }
                // fuzzy contains for common phrases
                matched ??= BucketKeys.FirstOrDefault(b => norm.Contains(NormalizeHeader(b)));
                if (matched == null)
                {
                    foreach (var kv in Aliases)
                    {
                        if (kv.Value.Any(a => a.Length >= 4 && (norm.Contains(a) || a.Contains(norm))))
                        {
                            matched = kv.Key;
                            break;
                        }
                    }
                }
                map[header] = matched ?? "ignore";
            }
            return map;
        }

        private static Dictionary<string, string> MergeMapping(
            List<string> headers,
            Dictionary<string, string> suggested,
            Dictionary<string, string>? overrideMap)
        {
            var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var h in headers)
                result[h] = suggested.TryGetValue(h, out var s) ? s : "ignore";

            if (overrideMap == null) return result;

            foreach (var kv in overrideMap)
            {
                // Allow override keyed by header name
                if (result.ContainsKey(kv.Key))
                    result[kv.Key] = string.IsNullOrWhiteSpace(kv.Value) ? "ignore" : kv.Value.Trim();
            }
            return result;
        }

        private static string NormalizeHeader(string h) =>
            Regex.Replace((h ?? "").ToLowerInvariant(), @"[^a-z0-9]", "");

        private static bool TryParseMoney(string raw, out decimal value)
        {
            value = 0;
            if (string.IsNullOrWhiteSpace(raw)) return false;
            var s = raw.Trim();
            var neg = false;
            if (s.StartsWith("(") && s.EndsWith(")"))
            {
                neg = true;
                s = s[1..^1];
            }
            s = s.Replace("$", "").Replace(",", "").Trim();
            if (s.StartsWith("-"))
            {
                neg = true;
                s = s[1..].Trim();
            }
            if (!decimal.TryParse(s, NumberStyles.Number, CultureInfo.InvariantCulture, out value)
                && !decimal.TryParse(s, NumberStyles.Number, CultureInfo.CurrentCulture, out value))
                return false;
            if (neg) value = -value;
            return true;
        }

        private static bool TryParseDate(string raw, out DateTime value)
        {
            value = default;
            if (string.IsNullOrWhiteSpace(raw)) return false;
            var formats = new[]
            {
                "yyyy-MM-dd", "M/d/yyyy", "MM/dd/yyyy", "M/d/yy", "MM/dd/yy",
                "d-MMM-yyyy", "yyyy/MM/dd"
            };
            if (DateTime.TryParseExact(raw.Trim(), formats, CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeLocal, out value))
                return true;
            return DateTime.TryParse(raw.Trim(), CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out value)
                   || DateTime.TryParse(raw.Trim(), CultureInfo.CurrentCulture, DateTimeStyles.AssumeLocal, out value);
        }

        private static string ComputeSha256Hex(string text)
        {
            var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(text));
            return Convert.ToHexString(bytes).ToLowerInvariant();
        }

        /// <summary>Minimal CSV parser (quoted fields, commas, CRLF).</summary>
        public static List<string[]> ParseCsv(string text)
        {
            var rows = new List<string[]>();
            var current = new List<string>();
            var field = new StringBuilder();
            var inQuotes = false;

            for (var i = 0; i < text.Length; i++)
            {
                var ch = text[i];
                var next = i + 1 < text.Length ? text[i + 1] : '\0';

                if (inQuotes)
                {
                    if (ch == '"' && next == '"')
                    {
                        field.Append('"');
                        i++;
                    }
                    else if (ch == '"')
                    {
                        inQuotes = false;
                    }
                    else
                    {
                        field.Append(ch);
                    }
                    continue;
                }

                if (ch == '"')
                {
                    inQuotes = true;
                }
                else if (ch == ',')
                {
                    current.Add(field.ToString().Trim());
                    field.Clear();
                }
                else if (ch == '\n' || (ch == '\r' && next == '\n'))
                {
                    current.Add(field.ToString().Trim());
                    field.Clear();
                    if (current.Any(c => !string.IsNullOrWhiteSpace(c)))
                        rows.Add(current.ToArray());
                    current = new List<string>();
                    if (ch == '\r') i++;
                }
                else if (ch != '\r')
                {
                    field.Append(ch);
                }
            }

            current.Add(field.ToString().Trim());
            if (current.Any(c => !string.IsNullOrWhiteSpace(c)))
                rows.Add(current.ToArray());

            return rows;
        }
    }

    public class PayrollImportParseResult
    {
        public List<string> Headers { get; set; } = new();
        public Dictionary<string, string> SuggestedMapping { get; set; } = new();
        public Dictionary<string, string> AppliedMapping { get; set; } = new();
        public int RowCount { get; set; }
        public string FileHash { get; set; } = "";
        public ManualPayrollAmounts Amounts { get; set; } = new();
        public DateTime? PayDate { get; set; }
        public DateTime? PayPeriodStart { get; set; }
        public DateTime? PayPeriodEnd { get; set; }
        public string? ExternalRunIdFromCsv { get; set; }
        public string DefaultExternalRunId { get; set; } = "";
        public List<string> Warnings { get; set; } = new();
    }
}
