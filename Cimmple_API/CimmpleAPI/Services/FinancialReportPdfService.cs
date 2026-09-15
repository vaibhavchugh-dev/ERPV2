using System.Globalization;
using System.Text;
using System.Text.Json;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace CimmpleAPI.Services;

/// <summary>
/// Renders financial report JSON payloads to PDF (QuestPDF) or CSV text.
/// </summary>
public static class FinancialReportPdfService
{
    static FinancialReportPdfService()
    {
        QuestPDF.Settings.License = LicenseType.Community;
    }

    public static byte[] BuildPdf(string reportType, object reportData)
    {
        var json = JsonSerializer.Serialize(reportData);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        var title = GetString(root, "reportType") ?? GetString(root, "ReportType") ?? reportType;
        var subtitle = BuildSubtitle(root);

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(36);
                page.DefaultTextStyle(x => x.FontSize(9).FontColor(Colors.Grey.Darken3));

                page.Header().Column(col =>
                {
                    col.Item().Text(title).FontSize(16).Bold().FontColor(Colors.Blue.Darken2);
                    if (!string.IsNullOrEmpty(subtitle))
                        col.Item().PaddingTop(4).Text(subtitle).FontSize(9).FontColor(Colors.Grey.Medium);
                    col.Item().PaddingTop(8).LineHorizontal(1).LineColor(Colors.Grey.Lighten2);
                });

                page.Content().PaddingTop(12).Column(col =>
                {
                    RenderBody(col, root, reportType);
                });

                page.Footer().AlignRight().Text(t =>
                {
                    t.Span("Generated ").FontSize(8).FontColor(Colors.Grey.Medium);
                    t.Span(DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm UTC")).FontSize(8).FontColor(Colors.Grey.Medium);
                    t.Span("  ·  ").FontSize(8);
                    t.CurrentPageNumber().FontSize(8);
                    t.Span(" / ").FontSize(8);
                    t.TotalPages().FontSize(8);
                });
            });
        }).GeneratePdf();
    }

    public static string BuildCsv(object reportData)
    {
        var json = JsonSerializer.Serialize(reportData);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        var sb = new StringBuilder();

        var reportType = GetString(root, "reportType") ?? GetString(root, "ReportType") ?? "Report";
        sb.AppendLine($"Report Type,{Escape(reportType)}");
        var asOf = GetString(root, "asOfDate") ?? GetString(root, "AsOfDate");
        if (!string.IsNullOrEmpty(asOf)) sb.AppendLine($"As Of Date,{asOf}");
        var ps = GetString(root, "periodStart") ?? GetString(root, "PeriodStart");
        var pe = GetString(root, "periodEnd") ?? GetString(root, "PeriodEnd");
        if (!string.IsNullOrEmpty(ps)) sb.AppendLine($"Period,{ps} to {pe}");
        sb.AppendLine();

        if (TryGetProperty(root, "sections", out var sections) && sections.ValueKind == JsonValueKind.Array)
        {
            foreach (var sec in sections.EnumerateArray())
            {
                var title = GetString(sec, "title") ?? GetString(sec, "Title") ?? "";
                sb.AppendLine(Escape(title));
                if (TryGetProperty(sec, "lines", out var lines) && lines.ValueKind == JsonValueKind.Array)
                {
                    foreach (var ln in lines.EnumerateArray())
                    {
                        var code = GetString(ln, "accountCode") ?? GetString(ln, "AccountCode") ?? "";
                        var name = GetString(ln, "accountName") ?? GetString(ln, "AccountName")
                                   ?? GetString(ln, "description") ?? GetString(ln, "Description") ?? "";
                        var amt = GetDecimal(ln, "amount") ?? GetDecimal(ln, "Amount")
                                  ?? GetDecimal(ln, "balance") ?? GetDecimal(ln, "Balance") ?? 0;
                        sb.AppendLine($"{Escape(code)},{Escape(name)},{amt.ToString(CultureInfo.InvariantCulture)}");
                    }
                }
                var sub = GetDecimal(sec, "subtotal") ?? GetDecimal(sec, "Subtotal");
                if (sub.HasValue) sb.AppendLine($"Subtotal,{sub.Value.ToString(CultureInfo.InvariantCulture)}");
                sb.AppendLine();
            }
        }

        if (TryGetProperty(root, "assets", out var assets))
        {
            sb.AppendLine("Assets");
            sb.AppendLine($"Current Assets,{GetDecimal(assets, "currentAssets") ?? GetDecimal(assets, "CurrentAssets") ?? 0}");
            sb.AppendLine($"Fixed Assets,{GetDecimal(assets, "fixedAssets") ?? GetDecimal(assets, "FixedAssets") ?? 0}");
            sb.AppendLine($"Total Assets,{GetDecimal(assets, "totalAssets") ?? GetDecimal(assets, "TotalAssets") ?? 0}");
            sb.AppendLine();
        }

        if (TryGetProperty(root, "accounts", out var accounts) && accounts.ValueKind == JsonValueKind.Array)
        {
            sb.AppendLine("Account Code,Account Name,Type,Debit,Credit,Balance");
            foreach (var a in accounts.EnumerateArray())
            {
                sb.AppendLine(string.Join(",",
                    Escape(GetString(a, "accountCode") ?? ""),
                    Escape(GetString(a, "accountName") ?? ""),
                    Escape(GetString(a, "accountType") ?? ""),
                    (GetDecimal(a, "debit") ?? GetDecimal(a, "Debit") ?? 0).ToString(CultureInfo.InvariantCulture),
                    (GetDecimal(a, "credit") ?? GetDecimal(a, "Credit") ?? 0).ToString(CultureInfo.InvariantCulture),
                    (GetDecimal(a, "balance") ?? 0).ToString(CultureInfo.InvariantCulture)));
            }
            sb.AppendLine($"Total Debits,,,{(GetDecimal(root, "totalDebits") ?? GetDecimal(root, "TotalDebits") ?? 0).ToString(CultureInfo.InvariantCulture)}");
            sb.AppendLine($"Total Credits,,,{(GetDecimal(root, "totalCredits") ?? GetDecimal(root, "TotalCredits") ?? 0).ToString(CultureInfo.InvariantCulture)}");
        }

        if (TryGetProperty(root, "agingBuckets", out var buckets) && buckets.ValueKind == JsonValueKind.Array)
        {
            sb.AppendLine("Bucket,Amount,Percentage");
            foreach (var b in buckets.EnumerateArray())
            {
                sb.AppendLine($"{Escape(GetString(b, "bucket") ?? "")},{GetDecimal(b, "amount") ?? 0},{GetDecimal(b, "percentage") ?? 0}");
            }
        }

        if (TryGetProperty(root, "statements", out var stmts) && stmts.ValueKind == JsonValueKind.Array)
        {
            foreach (var st in stmts.EnumerateArray())
            {
                sb.AppendLine($"Customer,{Escape(GetString(st, "customerName") ?? "")}");
                sb.AppendLine($"Opening,{GetDecimal(st, "openingBalance") ?? 0}");
                sb.AppendLine("Date,Type,Reference,Charges,Payments,Balance");
                if (TryGetProperty(st, "activity", out var act) && act.ValueKind == JsonValueKind.Array)
                {
                    foreach (var line in act.EnumerateArray())
                    {
                        sb.AppendLine(string.Join(",",
                            GetString(line, "date") ?? "",
                            Escape(GetString(line, "type") ?? ""),
                            Escape(GetString(line, "reference") ?? ""),
                            (GetDecimal(line, "charges") ?? 0).ToString(CultureInfo.InvariantCulture),
                            (GetDecimal(line, "payments") ?? 0).ToString(CultureInfo.InvariantCulture),
                            (GetDecimal(line, "balance") ?? 0).ToString(CultureInfo.InvariantCulture)));
                    }
                }
                sb.AppendLine($"Closing,{GetDecimal(st, "closingBalance") ?? 0}");
                sb.AppendLine();
            }
        }

        if (TryGetProperty(root, "vendors", out var vendors) && vendors.ValueKind == JsonValueKind.Array)
        {
            sb.AppendLine("Vendor,Code,Payments,Payment Count,Open AP,Invoices Paid");
            foreach (var v in vendors.EnumerateArray())
            {
                sb.AppendLine(string.Join(",",
                    Escape(GetString(v, "vendorName") ?? ""),
                    Escape(GetString(v, "vendorCode") ?? ""),
                    (GetDecimal(v, "paymentsInPeriod") ?? 0).ToString(CultureInfo.InvariantCulture),
                    (GetDecimal(v, "paymentCount") ?? 0).ToString(CultureInfo.InvariantCulture),
                    (GetDecimal(v, "openApBalance") ?? 0).ToString(CultureInfo.InvariantCulture),
                    (GetDecimal(v, "invoicesPaidAmountInPeriod") ?? 0).ToString(CultureInfo.InvariantCulture)));
            }
            sb.AppendLine($"Total Payments,{(GetDecimal(root, "totalPaymentsInPeriod") ?? 0).ToString(CultureInfo.InvariantCulture)}");
            sb.AppendLine($"Total Open AP,{(GetDecimal(root, "totalOpenAp") ?? 0).ToString(CultureInfo.InvariantCulture)}");
        }

        if (GetDecimal(root, "operatingActivities").HasValue || GetDecimal(root, "OperatingActivities").HasValue)
        {
            sb.AppendLine($"Operating Activities,{(GetDecimal(root, "operatingActivities") ?? GetDecimal(root, "OperatingActivities") ?? 0).ToString(CultureInfo.InvariantCulture)}");
            sb.AppendLine($"Investing Activities,{(GetDecimal(root, "investingActivities") ?? GetDecimal(root, "InvestingActivities") ?? 0).ToString(CultureInfo.InvariantCulture)}");
            sb.AppendLine($"Financing Activities,{(GetDecimal(root, "financingActivities") ?? GetDecimal(root, "FinancingActivities") ?? 0).ToString(CultureInfo.InvariantCulture)}");
            sb.AppendLine($"Net Cash Flow,{(GetDecimal(root, "netCashFlow") ?? GetDecimal(root, "NetCashFlow") ?? 0).ToString(CultureInfo.InvariantCulture)}");
        }

        if (GetDecimal(root, "netIncome").HasValue || GetDecimal(root, "NetIncome").HasValue)
        {
            sb.AppendLine($"Net Income,{(GetDecimal(root, "netIncome") ?? GetDecimal(root, "NetIncome") ?? 0).ToString(CultureInfo.InvariantCulture)}");
        }

        return sb.ToString();
    }

    private static void RenderBody(ColumnDescriptor col, JsonElement root, string reportType)
    {
        var note = GetString(root, "summaryNote") ?? GetString(root, "SummaryNote");
        if (!string.IsNullOrEmpty(note))
        {
            col.Item().PaddingBottom(8).Background(Colors.Amber.Lighten4).Padding(8)
                .Text(note).FontSize(8).FontColor(Colors.Amber.Darken3);
        }

        if (TryGetProperty(root, "sections", out var sections) && sections.ValueKind == JsonValueKind.Array)
        {
            foreach (var sec in sections.EnumerateArray())
            {
                var title = GetString(sec, "title") ?? GetString(sec, "Title") ?? "";
                col.Item().PaddingTop(8).Text(title).Bold().FontSize(11);
                if (TryGetProperty(sec, "lines", out var lines) && lines.ValueKind == JsonValueKind.Array && lines.GetArrayLength() > 0)
                {
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(c =>
                        {
                            c.RelativeColumn(2);
                            c.RelativeColumn(5);
                            c.RelativeColumn(2);
                        });
                        table.Header(h =>
                        {
                            h.Cell().Text("Code").Bold();
                            h.Cell().Text("Description").Bold();
                            h.Cell().AlignRight().Text("Amount").Bold();
                        });
                        foreach (var ln in lines.EnumerateArray())
                        {
                            var code = GetString(ln, "accountCode") ?? GetString(ln, "AccountCode")
                                       ?? GetString(ln, "date") ?? GetString(ln, "Date") ?? "";
                            var name = GetString(ln, "accountName") ?? GetString(ln, "AccountName")
                                       ?? GetString(ln, "description") ?? GetString(ln, "Description") ?? "";
                            var amt = GetDecimal(ln, "amount") ?? GetDecimal(ln, "Amount")
                                      ?? GetDecimal(ln, "balance") ?? GetDecimal(ln, "Balance") ?? 0;
                            table.Cell().Text(code);
                            table.Cell().Text(name);
                            table.Cell().AlignRight().Text(FormatMoney(amt));
                        }
                    });
                }
                var sub = GetDecimal(sec, "subtotal") ?? GetDecimal(sec, "Subtotal");
                if (sub.HasValue)
                    col.Item().AlignRight().Text($"Subtotal: {FormatMoney(sub.Value)}").Bold();
            }

            // P&L / cash flow totals
            if (GetDecimal(root, "netIncome").HasValue || GetDecimal(root, "NetIncome").HasValue)
                col.Item().PaddingTop(8).AlignRight().Text($"Net Income: {FormatMoney(GetDecimal(root, "netIncome") ?? GetDecimal(root, "NetIncome") ?? 0)}").Bold().FontSize(11);
            if (GetDecimal(root, "netCashFlow").HasValue || GetDecimal(root, "NetCashFlow").HasValue)
                col.Item().PaddingTop(8).AlignRight().Text($"Net Cash Flow: {FormatMoney(GetDecimal(root, "netCashFlow") ?? GetDecimal(root, "NetCashFlow") ?? 0)}").Bold().FontSize(11);
            return;
        }

        // Legacy BS flat
        if (TryGetProperty(root, "assets", out var assets))
        {
            col.Item().Text("Assets").Bold().FontSize(11);
            MoneyRow(col, "Current Assets", GetDecimal(assets, "currentAssets") ?? GetDecimal(assets, "CurrentAssets") ?? 0);
            MoneyRow(col, "Fixed Assets", GetDecimal(assets, "fixedAssets") ?? GetDecimal(assets, "FixedAssets") ?? 0);
            MoneyRow(col, "Total Assets", GetDecimal(assets, "totalAssets") ?? GetDecimal(assets, "TotalAssets") ?? 0, bold: true);
        }
        if (TryGetProperty(root, "liabilitiesAndEquity", out var le) || TryGetProperty(root, "LiabilitiesAndEquity", out le))
        {
            col.Item().PaddingTop(8).Text("Liabilities and Equity").Bold().FontSize(11);
            MoneyRow(col, "Current Liabilities", GetDecimal(le, "currentLiabilities") ?? GetDecimal(le, "CurrentLiabilities") ?? 0);
            MoneyRow(col, "Long Term Liabilities", GetDecimal(le, "longTermLiabilities") ?? GetDecimal(le, "LongTermLiabilities") ?? 0);
            MoneyRow(col, "Equity", GetDecimal(le, "equity") ?? GetDecimal(le, "Equity") ?? 0);
            MoneyRow(col, "Total Liabilities and Equity", GetDecimal(le, "totalLiabilitiesAndEquity") ?? GetDecimal(le, "TotalLiabilitiesAndEquity") ?? 0, bold: true);
        }

        if (TryGetProperty(root, "accounts", out var accounts) && accounts.ValueKind == JsonValueKind.Array)
        {
            col.Item().Text("Trial Balance").Bold().FontSize(11);
            col.Item().Table(table =>
            {
                table.ColumnsDefinition(c =>
                {
                    c.RelativeColumn(2);
                    c.RelativeColumn(4);
                    c.RelativeColumn(2);
                    c.RelativeColumn(2);
                    c.RelativeColumn(2);
                });
                table.Header(h =>
                {
                    h.Cell().Text("Code").Bold();
                    h.Cell().Text("Account").Bold();
                    h.Cell().Text("Type").Bold();
                    h.Cell().AlignRight().Text("Debit").Bold();
                    h.Cell().AlignRight().Text("Credit").Bold();
                });
                foreach (var a in accounts.EnumerateArray())
                {
                    table.Cell().Text(GetString(a, "accountCode") ?? "");
                    table.Cell().Text(GetString(a, "accountName") ?? "");
                    table.Cell().Text(GetString(a, "accountType") ?? "");
                    table.Cell().AlignRight().Text(FormatMoney(GetDecimal(a, "debit") ?? GetDecimal(a, "Debit") ?? 0));
                    table.Cell().AlignRight().Text(FormatMoney(GetDecimal(a, "credit") ?? GetDecimal(a, "Credit") ?? 0));
                }
            });
            MoneyRow(col, "Total Debits", GetDecimal(root, "totalDebits") ?? GetDecimal(root, "TotalDebits") ?? 0, bold: true);
            MoneyRow(col, "Total Credits", GetDecimal(root, "totalCredits") ?? GetDecimal(root, "TotalCredits") ?? 0, bold: true);
        }

        if (TryGetProperty(root, "agingBuckets", out var buckets) && buckets.ValueKind == JsonValueKind.Array)
        {
            col.Item().Text("Aging").Bold().FontSize(11);
            col.Item().Table(table =>
            {
                table.ColumnsDefinition(c =>
                {
                    c.RelativeColumn(4);
                    c.RelativeColumn(2);
                    c.RelativeColumn(2);
                });
                table.Header(h =>
                {
                    h.Cell().Text("Bucket").Bold();
                    h.Cell().AlignRight().Text("Amount").Bold();
                    h.Cell().AlignRight().Text("%").Bold();
                });
                foreach (var b in buckets.EnumerateArray())
                {
                    table.Cell().Text(GetString(b, "bucket") ?? "");
                    table.Cell().AlignRight().Text(FormatMoney(GetDecimal(b, "amount") ?? 0));
                    table.Cell().AlignRight().Text($"{GetDecimal(b, "percentage") ?? 0:0.0}%");
                }
            });
        }

        if (TryGetProperty(root, "statements", out var stmts) && stmts.ValueKind == JsonValueKind.Array)
        {
            foreach (var st in stmts.EnumerateArray())
            {
                col.Item().PaddingTop(10).Text(GetString(st, "customerName") ?? "Customer").Bold().FontSize(11);
                MoneyRow(col, "Opening Balance", GetDecimal(st, "openingBalance") ?? 0);
                if (TryGetProperty(st, "activity", out var act) && act.ValueKind == JsonValueKind.Array)
                {
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(c =>
                        {
                            c.RelativeColumn(2);
                            c.RelativeColumn(2);
                            c.RelativeColumn(2);
                            c.RelativeColumn(2);
                            c.RelativeColumn(2);
                            c.RelativeColumn(2);
                        });
                        table.Header(h =>
                        {
                            h.Cell().Text("Date").Bold();
                            h.Cell().Text("Type").Bold();
                            h.Cell().Text("Ref").Bold();
                            h.Cell().AlignRight().Text("Charges").Bold();
                            h.Cell().AlignRight().Text("Payments").Bold();
                            h.Cell().AlignRight().Text("Balance").Bold();
                        });
                        foreach (var line in act.EnumerateArray())
                        {
                            table.Cell().Text(GetString(line, "date") ?? "");
                            table.Cell().Text(GetString(line, "type") ?? "");
                            table.Cell().Text(GetString(line, "reference") ?? "");
                            table.Cell().AlignRight().Text(FormatMoney(GetDecimal(line, "charges") ?? 0));
                            table.Cell().AlignRight().Text(FormatMoney(GetDecimal(line, "payments") ?? 0));
                            table.Cell().AlignRight().Text(FormatMoney(GetDecimal(line, "balance") ?? 0));
                        }
                    });
                }
                MoneyRow(col, "Closing Balance", GetDecimal(st, "closingBalance") ?? 0, bold: true);
            }
        }

        if (TryGetProperty(root, "vendors", out var vendors) && vendors.ValueKind == JsonValueKind.Array)
        {
            col.Item().Text("Vendors").Bold().FontSize(11);
            col.Item().Table(table =>
            {
                table.ColumnsDefinition(c =>
                {
                    c.RelativeColumn(4);
                    c.RelativeColumn(2);
                    c.RelativeColumn(2);
                    c.RelativeColumn(2);
                });
                table.Header(h =>
                {
                    h.Cell().Text("Vendor").Bold();
                    h.Cell().AlignRight().Text("Payments").Bold();
                    h.Cell().AlignRight().Text("Open AP").Bold();
                    h.Cell().AlignRight().Text("Count").Bold();
                });
                foreach (var v in vendors.EnumerateArray())
                {
                    table.Cell().Text(GetString(v, "vendorName") ?? "");
                    table.Cell().AlignRight().Text(FormatMoney(GetDecimal(v, "paymentsInPeriod") ?? 0));
                    table.Cell().AlignRight().Text(FormatMoney(GetDecimal(v, "openApBalance") ?? 0));
                    table.Cell().AlignRight().Text(((int)(GetDecimal(v, "paymentCount") ?? 0)).ToString());
                }
            });
            MoneyRow(col, "Total Payments", GetDecimal(root, "totalPaymentsInPeriod") ?? 0, bold: true);
            MoneyRow(col, "Total Open AP", GetDecimal(root, "totalOpenAp") ?? 0, bold: true);
        }

        // Cash flow scalars if no sections rendered above
        if (!TryGetProperty(root, "sections", out _) &&
            (GetDecimal(root, "operatingActivities").HasValue || GetDecimal(root, "OperatingActivities").HasValue))
        {
            col.Item().Text("Cash Flow").Bold().FontSize(11);
            MoneyRow(col, "Operating", GetDecimal(root, "operatingActivities") ?? GetDecimal(root, "OperatingActivities") ?? 0);
            MoneyRow(col, "Investing", GetDecimal(root, "investingActivities") ?? GetDecimal(root, "InvestingActivities") ?? 0);
            MoneyRow(col, "Financing", GetDecimal(root, "financingActivities") ?? GetDecimal(root, "FinancingActivities") ?? 0);
            MoneyRow(col, "Net Cash Flow", GetDecimal(root, "netCashFlow") ?? GetDecimal(root, "NetCashFlow") ?? 0, bold: true);
        }

        _ = reportType;
    }

    private static void MoneyRow(ColumnDescriptor col, string label, decimal amount, bool bold = false)
    {
        col.Item().Row(row =>
        {
            var left = row.RelativeItem().Text(label);
            if (bold) left.Bold();
            var right = row.ConstantItem(100).AlignRight().Text(FormatMoney(amount));
            if (bold) right.Bold();
        });
    }

    private static string BuildSubtitle(JsonElement root)
    {
        var asOf = GetString(root, "asOfDate") ?? GetString(root, "AsOfDate");
        if (!string.IsNullOrEmpty(asOf)) return $"As of {asOf}";
        var ps = GetString(root, "periodStart") ?? GetString(root, "PeriodStart");
        var pe = GetString(root, "periodEnd") ?? GetString(root, "PeriodEnd");
        if (!string.IsNullOrEmpty(ps)) return $"Period {ps} to {pe}";
        return "";
    }

    private static string FormatMoney(decimal v) =>
        v.ToString("C", CultureInfo.GetCultureInfo("en-US"));

    private static string Escape(string s) =>
        s.Contains(',') || s.Contains('"') ? $"\"{s.Replace("\"", "\"\"")}\"" : s;

    private static bool TryGetProperty(JsonElement el, string name, out JsonElement value)
    {
        if (el.ValueKind == JsonValueKind.Object)
        {
            if (el.TryGetProperty(name, out value)) return true;
            var pascal = char.ToUpperInvariant(name[0]) + name[1..];
            if (el.TryGetProperty(pascal, out value)) return true;
        }
        value = default;
        return false;
    }

    private static string? GetString(JsonElement el, string name) =>
        TryGetProperty(el, name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;

    private static decimal? GetDecimal(JsonElement el, string name)
    {
        if (!TryGetProperty(el, name, out var p)) return null;
        if (p.ValueKind == JsonValueKind.Number && p.TryGetDecimal(out var d)) return d;
        if (p.ValueKind == JsonValueKind.String && decimal.TryParse(p.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out d))
            return d;
        return null;
    }
}
