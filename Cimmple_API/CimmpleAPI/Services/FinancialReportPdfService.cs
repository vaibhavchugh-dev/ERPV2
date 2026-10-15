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
        if (IsProfitLoss(root)) sb.AppendLine("Basis,Accrual (general ledger)");
        sb.AppendLine();

        if (IsProfitLoss(root))
        {
            sb.AppendLine("Account Code,Line,Amount");
            foreach (var row in BuildProfitLossRows(root))
            {
                var label = new string(' ', row.Indent * 2) + row.Label;
                var amount = row.Amount.HasValue ? row.Amount.Value.ToString(CultureInfo.InvariantCulture) : "";
                sb.AppendLine($"{Escape(row.Code)},{Escape(label)},{amount}");
            }
            return sb.ToString();
        }

        if (TryGetProperty(root, "sections", out var sections) && sections.ValueKind == JsonValueKind.Array)
        {
            foreach (var sec in sections.EnumerateArray())
            {
                if (!SectionHasContent(sec))
                    continue;
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
            sb.AppendLine($"Days Past Due,Open Balance,{AgingShareLabel(root)}");
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
            sb.AppendLine($"Vendor,Code,Payments,Payment Count,{Escape(OpenApLabel(root))},Invoices Paid");
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
            sb.AppendLine($"{Escape("Total " + OpenApLabel(root))},{(GetDecimal(root, "totalOpenAp") ?? 0).ToString(CultureInfo.InvariantCulture)}");
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

        var reportBasis = GetString(root, "reportBasis") ?? GetString(root, "ReportBasis") ?? "";

        // Balance Sheet — major headers (Assets / Liabilities and Equity) matching on-screen view.
        // Prefer assets DTO over flat sections[] so we don't lose the parent headers.
        if (TryGetProperty(root, "assets", out var assets))
        {
            RenderBalanceSheet(col, root, assets);
            return;
        }

        if (IsProfitLoss(root))
        {
            RenderProfitLoss(col, root);
            return;
        }

        // Cash Flow sections — skip empty sections (same rule as UI).
        if (TryGetProperty(root, "sections", out var sections) && sections.ValueKind == JsonValueKind.Array)
        {
            var isCashFlow = reportBasis.Equals("direct-cash", StringComparison.OrdinalIgnoreCase)
                             || reportType.Contains("cash", StringComparison.OrdinalIgnoreCase);

            if (isCashFlow)
                col.Item().Text("Cash Flow (direct)").Bold().FontSize(12);

            foreach (var sec in sections.EnumerateArray())
            {
                if (!SectionHasContent(sec))
                    continue;

                var title = GetString(sec, "title") ?? GetString(sec, "Title") ?? "";
                col.Item().PaddingTop(10).Text(title).Bold().FontSize(10);

                if (TryGetProperty(sec, "lines", out var lines) && lines.ValueKind == JsonValueKind.Array && lines.GetArrayLength() > 0)
                {
                    var first = lines[0];
                    var cashStyle = isCashFlow || GetString(first, "date") != null || GetString(first, "Date") != null;
                    if (cashStyle)
                        RenderCashFlowLines(col, lines);
                    else
                        RenderAccountLines(col, lines);
                }

                var sub = GetDecimal(sec, "subtotal") ?? GetDecimal(sec, "Subtotal");
                if (sub.HasValue)
                    MoneyRow(col, $"Subtotal — {title}", sub.Value);
            }

            if (isCashFlow || GetDecimal(root, "netCashFlow").HasValue || GetDecimal(root, "NetCashFlow").HasValue)
            {
                col.Item().PaddingTop(6).LineHorizontal(1).LineColor(Colors.Grey.Darken2);
                MoneyRow(col, "Net Cash Flow",
                    GetDecimal(root, "netCashFlow") ?? GetDecimal(root, "NetCashFlow") ?? 0, bold: true);
            }

            return;
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
                    h.Cell().Text("Days Past Due").Bold();
                    h.Cell().AlignRight().Text("Open Balance").Bold();
                    h.Cell().AlignRight().Text(AgingShareLabel(root)).Bold();
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
                col.Item().PaddingTop(12).Text(GetString(st, "customerName") ?? "Customer").Bold().FontSize(11);
                MoneyRow(col, "Opening Balance", GetDecimal(st, "openingBalance") ?? GetDecimal(st, "OpeningBalance") ?? 0);
                if (TryGetProperty(st, "activity", out var act) && act.ValueKind == JsonValueKind.Array && act.GetArrayLength() > 0)
                {
                    col.Item().PaddingTop(4).Table(table =>
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

                col.Item().PaddingTop(8).LineHorizontal(1.5f).LineColor(Colors.Grey.Darken3);
                col.Item().PaddingTop(6).PaddingBottom(4).Row(row =>
                {
                    row.RelativeItem().Text("Closing Balance").Bold().FontSize(10);
                    row.ConstantItem(110).AlignRight()
                        .Text(FormatMoney(GetDecimal(st, "closingBalance") ?? GetDecimal(st, "ClosingBalance") ?? 0))
                        .Bold().FontSize(10);
                });
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
                    h.Cell().AlignRight().Text(OpenApLabel(root)).Bold();
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
            MoneyRow(col, "Total " + OpenApLabel(root), GetDecimal(root, "totalOpenAp") ?? 0, bold: true);
        }

        _ = reportType;
    }

    private static void RenderBalanceSheet(ColumnDescriptor col, JsonElement root, JsonElement assets)
    {
        col.Item().Text("Assets").Bold().FontSize(12);
        RenderBsSubsection(col, "Current Assets",
            GetLines(assets, "currentAssetLines", "CurrentAssetLines"),
            GetDecimal(assets, "currentAssets") ?? GetDecimal(assets, "CurrentAssets") ?? 0);
        RenderBsSubsection(col, "Fixed Assets",
            GetLines(assets, "fixedAssetLines", "FixedAssetLines"),
            GetDecimal(assets, "fixedAssets") ?? GetDecimal(assets, "FixedAssets") ?? 0);
        col.Item().PaddingTop(4).LineHorizontal(1.5f).LineColor(Colors.Grey.Darken3);
        MoneyRow(col, "Total Assets",
            GetDecimal(assets, "totalAssets") ?? GetDecimal(assets, "TotalAssets") ?? 0, bold: true);

        if (!TryGetProperty(root, "liabilitiesAndEquity", out var le) &&
            !TryGetProperty(root, "LiabilitiesAndEquity", out le))
            return;

        col.Item().PaddingTop(14).Text("Liabilities and Equity").Bold().FontSize(12);
        RenderBsSubsection(col, "Current Liabilities",
            GetLines(le, "currentLiabilityLines", "CurrentLiabilityLines"),
            GetDecimal(le, "currentLiabilities") ?? GetDecimal(le, "CurrentLiabilities") ?? 0);
        RenderBsSubsection(col, "Long Term Liabilities",
            GetLines(le, "longTermLiabilityLines", "LongTermLiabilityLines"),
            GetDecimal(le, "longTermLiabilities") ?? GetDecimal(le, "LongTermLiabilities") ?? 0);
        RenderBsSubsection(col, "Equity",
            GetLines(le, "equityLines", "EquityLines"),
            GetDecimal(le, "equity") ?? GetDecimal(le, "Equity") ?? 0);
        col.Item().PaddingTop(4).LineHorizontal(1.5f).LineColor(Colors.Grey.Darken3);
        MoneyRow(col, "Total Liabilities and Equity",
            GetDecimal(le, "totalLiabilitiesAndEquity") ?? GetDecimal(le, "TotalLiabilitiesAndEquity") ?? 0,
            bold: true);
    }

    private enum PlRowKind { Heading, SubHeading, Account, Subtotal, Total, GrandTotal }

    private sealed record PlRow(PlRowKind Kind, string Label, decimal? Amount = null, int Indent = 0, string Code = "");

    private static bool IsProfitLoss(JsonElement root)
    {
        var basis = GetString(root, "reportBasis") ?? "";
        if (basis.Equals("accrual-gl", StringComparison.OrdinalIgnoreCase)) return true;
        var type = GetString(root, "reportType") ?? "";
        return type.Contains("profit", StringComparison.OrdinalIgnoreCase);
    }

    private static JsonElement? FindSection(JsonElement root, string sectionId)
    {
        if (!TryGetProperty(root, "sections", out var sections) || sections.ValueKind != JsonValueKind.Array)
            return null;
        foreach (var sec in sections.EnumerateArray())
        {
            var id = GetString(sec, "sectionId") ?? "";
            if (id.Equals(sectionId, StringComparison.OrdinalIgnoreCase))
                return sec;
        }
        return null;
    }

    /// <summary>
    /// Standard multi-step P&amp;L: Revenue → COGS → Gross Profit → Operating Expenses → Operating Income
    /// → Other Income/(Expense) → Income Before Tax → Income Tax → Net Income. Shared by PDF and CSV.
    /// </summary>
    private static List<PlRow> BuildProfitLossRows(JsonElement root)
    {
        var rows = new List<PlRow>();
        decimal Total(string key) => GetDecimal(root, key) ?? 0;
        decimal Subtotal(JsonElement? sec) => sec.HasValue ? GetDecimal(sec.Value, "subtotal") ?? 0 : 0;
        bool HasContent(JsonElement? sec) => sec.HasValue && SectionHasContent(sec.Value);

        void AddLines(JsonElement? sec, int indent, bool negate = false)
        {
            if (!sec.HasValue || !TryGetProperty(sec.Value, "lines", out var lines) || lines.ValueKind != JsonValueKind.Array)
                return;
            foreach (var ln in lines.EnumerateArray())
            {
                var amt = GetDecimal(ln, "amount") ?? 0;
                rows.Add(new PlRow(PlRowKind.Account, GetString(ln, "accountName") ?? "",
                    negate ? -amt : amt, indent, GetString(ln, "accountCode") ?? ""));
            }
        }

        var revenue = FindSection(root, "revenue");
        var cogs = FindSection(root, "costOfGoodsSold");
        var sga = FindSection(root, "operatingExpenses");
        var rd = FindSection(root, "researchAndDevelopment");
        var otherIncome = FindSection(root, "otherIncome");
        var otherExpense = FindSection(root, "otherExpense");
        var tax = FindSection(root, "incomeTax");

        rows.Add(new PlRow(PlRowKind.Heading, "Revenue"));
        AddLines(revenue, 1);
        rows.Add(new PlRow(PlRowKind.Subtotal, "Total Revenue", Total("netRevenue")));

        if (HasContent(cogs))
        {
            rows.Add(new PlRow(PlRowKind.Heading, "Cost of Goods Sold"));
            AddLines(cogs, 1);
            rows.Add(new PlRow(PlRowKind.Subtotal, "Total Cost of Goods Sold", Total("totalCostOfGoodsSold")));
        }
        rows.Add(new PlRow(PlRowKind.Total, "Gross Profit", Total("grossProfit")));

        if (HasContent(sga) || HasContent(rd))
        {
            rows.Add(new PlRow(PlRowKind.Heading, "Operating Expenses"));
            if (HasContent(sga))
            {
                rows.Add(new PlRow(PlRowKind.SubHeading, "Selling, General & Administrative"));
                AddLines(sga, 1);
                rows.Add(new PlRow(PlRowKind.Subtotal, "Total Selling, General & Administrative", Subtotal(sga)));
            }
            if (HasContent(rd))
            {
                rows.Add(new PlRow(PlRowKind.SubHeading, "Research & Development"));
                AddLines(rd, 1);
                rows.Add(new PlRow(PlRowKind.Subtotal, "Total Research & Development", Subtotal(rd)));
            }
            var opEx = GetDecimal(root, "totalOperatingExpensesAll") ?? Subtotal(sga) + Subtotal(rd);
            rows.Add(new PlRow(PlRowKind.Subtotal, "Total Operating Expenses", opEx));
        }
        rows.Add(new PlRow(PlRowKind.Total, "Operating Income", Total("operatingIncome")));

        if (HasContent(otherIncome) || HasContent(otherExpense))
        {
            rows.Add(new PlRow(PlRowKind.Heading, "Other Income / (Expense)"));
            AddLines(otherIncome, 1);
            AddLines(otherExpense, 1, negate: true);
            var netOther = GetDecimal(root, "netOtherIncome") ?? Subtotal(otherIncome) - Subtotal(otherExpense);
            rows.Add(new PlRow(PlRowKind.Subtotal, "Net Other Income / (Expense)", netOther));
        }
        rows.Add(new PlRow(PlRowKind.Total, "Income Before Tax", Total("incomeBeforeTax")));

        if (HasContent(tax))
        {
            rows.Add(new PlRow(PlRowKind.Heading, "Income Tax Expense"));
            AddLines(tax, 1);
            rows.Add(new PlRow(PlRowKind.Subtotal, "Total Income Tax", Total("totalIncomeTax")));
        }
        rows.Add(new PlRow(PlRowKind.GrandTotal, "Net Income", Total("netIncome")));

        return rows;
    }

    private static void RenderProfitLoss(ColumnDescriptor col, JsonElement root)
    {
        var rows = BuildProfitLossRows(root);

        col.Item().Table(table =>
        {
            table.ColumnsDefinition(c =>
            {
                c.ConstantColumn(52);
                c.RelativeColumn();
                c.ConstantColumn(110);
            });
            table.Header(h =>
            {
                h.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten1).PaddingBottom(3).Text("Code").Bold();
                h.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten1).PaddingBottom(3).PaddingLeft(12).Text("Account").Bold();
                h.Cell().BorderBottom(1).BorderColor(Colors.Grey.Lighten1).PaddingBottom(3).AlignRight().Text("Amount").Bold();
            });

            foreach (var row in rows)
            {
                var indent = row.Indent * 12f;
                switch (row.Kind)
                {
                    case PlRowKind.Heading:
                        table.Cell().ColumnSpan(3).PaddingTop(10).PaddingBottom(2)
                            .Text(row.Label.ToUpperInvariant()).Bold().FontSize(9.5f).FontColor(Colors.Grey.Darken4);
                        break;
                    case PlRowKind.SubHeading:
                        table.Cell().ColumnSpan(3).PaddingTop(4).PaddingLeft(indent)
                            .Text(row.Label).SemiBold();
                        break;
                    case PlRowKind.Account:
                        table.Cell().PaddingVertical(1.5f).Text(row.Code).FontColor(Colors.Grey.Darken1);
                        table.Cell().PaddingVertical(1.5f).PaddingLeft(indent).Text(row.Label);
                        table.Cell().PaddingVertical(1.5f).AlignRight().Text(FormatAccounting(row.Amount ?? 0));
                        break;
                    case PlRowKind.Subtotal:
                        table.Cell().ColumnSpan(2).PaddingTop(2).PaddingBottom(3).PaddingLeft(indent)
                            .Text(row.Label).SemiBold();
                        table.Cell().BorderTop(0.75f).BorderColor(Colors.Grey.Darken1).PaddingTop(2).PaddingBottom(3)
                            .AlignRight().Text(FormatAccounting(row.Amount ?? 0)).SemiBold();
                        break;
                    case PlRowKind.Total:
                        table.Cell().ColumnSpan(2).Background(Colors.Grey.Lighten4).PaddingVertical(4).PaddingLeft(2)
                            .Text(row.Label.ToUpperInvariant()).Bold();
                        table.Cell().Background(Colors.Grey.Lighten4).BorderTop(1).BorderColor(Colors.Grey.Darken3)
                            .PaddingVertical(4).AlignRight().Text(FormatAccounting(row.Amount ?? 0)).Bold();
                        break;
                    case PlRowKind.GrandTotal:
                        table.Cell().ColumnSpan(2).PaddingTop(8).PaddingBottom(4)
                            .Text(row.Label.ToUpperInvariant()).Bold().FontSize(11);
                        table.Cell().PaddingTop(6).BorderTop(1).BorderBottom(2.5f).BorderColor(Colors.Grey.Darken4)
                            .PaddingVertical(3).AlignRight().Text(FormatAccounting(row.Amount ?? 0)).Bold().FontSize(11);
                        break;
                }
            }
        });
    }

    /// <summary>Accounting style: negatives in parentheses.</summary>
    private static string FormatAccounting(decimal v)
    {
        var abs = Math.Abs(v).ToString("C", CultureInfo.GetCultureInfo("en-US"));
        return v < 0 ? $"({abs})" : abs;
    }

    private static JsonElement? GetLines(JsonElement parent, string camel, string pascal)
    {
        if (TryGetProperty(parent, camel, out var lines) && lines.ValueKind == JsonValueKind.Array)
            return lines;
        if (TryGetProperty(parent, pascal, out lines) && lines.ValueKind == JsonValueKind.Array)
            return lines;
        return null;
    }

    private static void RenderBsSubsection(ColumnDescriptor col, string title, JsonElement? lines, decimal subtotal)
    {
        col.Item().PaddingTop(8).Text(title).SemiBold().FontSize(10);
        if (lines.HasValue && lines.Value.GetArrayLength() > 0)
            RenderAccountLines(col, lines.Value, balanceKey: true);
        MoneyRow(col, $"Subtotal — {title}", subtotal);
    }

    private static bool SectionHasContent(JsonElement sec)
    {
        var hasLines = TryGetProperty(sec, "lines", out var lines)
                       && lines.ValueKind == JsonValueKind.Array
                       && lines.GetArrayLength() > 0;
        var sub = GetDecimal(sec, "subtotal") ?? GetDecimal(sec, "Subtotal") ?? 0;
        return hasLines || Math.Abs(sub) > 0.0001m;
    }

    private static void RenderAccountLines(ColumnDescriptor col, JsonElement lines, bool balanceKey = false)
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
                h.Cell().Text("Account").Bold();
                h.Cell().AlignRight().Text("Amount").Bold();
            });
            foreach (var ln in lines.EnumerateArray())
            {
                table.Cell().Text(GetString(ln, "accountCode") ?? GetString(ln, "AccountCode") ?? "");
                table.Cell().Text(GetString(ln, "accountName") ?? GetString(ln, "AccountName") ?? "");
                var amt = balanceKey
                    ? (GetDecimal(ln, "balance") ?? GetDecimal(ln, "Balance") ?? 0)
                    : (GetDecimal(ln, "amount") ?? GetDecimal(ln, "Amount")
                       ?? GetDecimal(ln, "balance") ?? GetDecimal(ln, "Balance") ?? 0);
                table.Cell().AlignRight().Text(FormatMoney(amt));
            }
        });
    }

    private static void RenderCashFlowLines(ColumnDescriptor col, JsonElement lines)
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
                h.Cell().Text("Date").Bold();
                h.Cell().Text("Description").Bold();
                h.Cell().AlignRight().Text("Amount").Bold();
            });
            foreach (var ln in lines.EnumerateArray())
            {
                table.Cell().Text(GetString(ln, "date") ?? GetString(ln, "Date") ?? "");
                table.Cell().Text(
                    GetString(ln, "description") ?? GetString(ln, "Description")
                    ?? GetString(ln, "category") ?? GetString(ln, "Category") ?? "");
                table.Cell().AlignRight().Text(FormatMoney(GetDecimal(ln, "amount") ?? GetDecimal(ln, "Amount") ?? 0));
            }
        });
    }

    private static void MoneyRow(ColumnDescriptor col, string label, decimal amount, bool bold = false)
    {
        col.Item().PaddingTop(2).Row(row =>
        {
            var left = row.RelativeItem().Text(label);
            if (bold) left.Bold();
            var right = row.ConstantItem(110).AlignRight().Text(FormatMoney(amount));
            if (bold) right.Bold();
        });
    }

    private static string BuildSubtitle(JsonElement root)
    {
        var asOf = GetString(root, "asOfDate") ?? GetString(root, "AsOfDate");
        if (!string.IsNullOrEmpty(asOf)) return $"As of {asOf}";
        var ps = GetString(root, "periodStart") ?? GetString(root, "PeriodStart");
        var pe = GetString(root, "periodEnd") ?? GetString(root, "PeriodEnd");
        if (!string.IsNullOrEmpty(ps))
        {
            return IsProfitLoss(root)
                ? $"For the period {ps} to {pe} · Accrual basis (general ledger)"
                : $"Period {ps} to {pe}";
        }
        return "";
    }

    private static string OpenApLabel(JsonElement root)
    {
        var asOf = GetString(root, "openApAsOf") ?? GetString(root, "OpenApAsOf");
        return string.IsNullOrEmpty(asOf) ? "Open AP" : $"Open AP as of {asOf}";
    }

    private static bool IsApAging(JsonElement root) =>
        (GetString(root, "reportType") ?? GetString(root, "ReportType") ?? "")
            .StartsWith("AP ", StringComparison.OrdinalIgnoreCase);

    private static string AgingShareLabel(JsonElement root) =>
        IsApAging(root) ? "% of Total Payables" : "% of Total Receivables";

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
