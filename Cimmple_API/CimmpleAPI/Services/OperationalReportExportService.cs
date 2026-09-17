using System.Globalization;
using System.Text;
using System.Text.Json;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace CimmpleAPI.Services;

/// <summary>
/// PDF/CSV export for operational reports (Reports module) using ReportResultDto sections.
/// </summary>
public static class OperationalReportExportService
{
    static OperationalReportExportService()
    {
        QuestPDF.Settings.License = LicenseType.Community;
    }

    public static byte[] BuildPdf(string reportTypeKey, object reportData)
    {
        var json = JsonSerializer.Serialize(reportData);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        var title = GetString(root, "reportType") ?? GetString(root, "ReportType") ?? reportTypeKey;
        var periodStart = GetString(root, "periodStart") ?? GetString(root, "PeriodStart");
        var periodEnd = GetString(root, "periodEnd") ?? GetString(root, "PeriodEnd");
        var subtitle = !string.IsNullOrEmpty(periodStart)
            ? $"Period: {periodStart} → {periodEnd}"
            : "";

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4.Landscape());
                page.Margin(28);
                page.DefaultTextStyle(x => x.FontSize(8).FontColor(Colors.Grey.Darken3));

                page.Header().Column(col =>
                {
                    col.Item().Text(title).FontSize(14).Bold().FontColor(Colors.Blue.Darken2);
                    if (!string.IsNullOrEmpty(subtitle))
                        col.Item().PaddingTop(2).Text(subtitle).FontSize(9).FontColor(Colors.Grey.Medium);
                    col.Item().PaddingTop(6).LineHorizontal(1).LineColor(Colors.Grey.Lighten2);
                });

                page.Content().PaddingTop(10).Column(col =>
                {
                    RenderSummary(col, root);
                    RenderSections(col, root);

                    var note = GetString(root, "summaryNote") ?? GetString(root, "SummaryNote");
                    if (!string.IsNullOrEmpty(note))
                        col.Item().PaddingTop(8).Text(note).Italic().FontColor(Colors.Grey.Medium);
                });

                page.Footer().AlignRight().Text(t =>
                {
                    t.Span("Generated ").FontSize(7).FontColor(Colors.Grey.Medium);
                    t.Span(DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm UTC")).FontSize(7).FontColor(Colors.Grey.Medium);
                    t.Span("  ·  ").FontSize(7);
                    t.CurrentPageNumber().FontSize(7);
                    t.Span(" / ").FontSize(7);
                    t.TotalPages().FontSize(7);
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
        var ps = GetString(root, "periodStart") ?? GetString(root, "PeriodStart");
        var pe = GetString(root, "periodEnd") ?? GetString(root, "PeriodEnd");
        if (!string.IsNullOrEmpty(ps)) sb.AppendLine($"Period,{Escape(ps)} to {Escape(pe ?? "")}");
        sb.AppendLine();

        if (TryGetProperty(root, "summary", out var summary) || TryGetProperty(root, "Summary", out summary))
        {
            if (summary.ValueKind == JsonValueKind.Array)
            {
                sb.AppendLine("Summary");
                foreach (var stat in summary.EnumerateArray())
                {
                    var label = GetString(stat, "label") ?? GetString(stat, "Label") ?? "";
                    var value = GetString(stat, "value") ?? GetString(stat, "Value") ?? "";
                    sb.AppendLine($"{Escape(label)},{Escape(value)}");
                }
                sb.AppendLine();
            }
        }

        if ((TryGetProperty(root, "sections", out var sections) || TryGetProperty(root, "Sections", out sections))
            && sections.ValueKind == JsonValueKind.Array)
        {
            foreach (var section in sections.EnumerateArray())
            {
                var title = GetString(section, "title") ?? GetString(section, "Title") ?? "Section";
                sb.AppendLine(Escape(title));

                if (!TryGetProperty(section, "columns", out var columns) &&
                    !TryGetProperty(section, "Columns", out columns))
                    continue;
                if (columns.ValueKind != JsonValueKind.Array) continue;

                var cols = columns.EnumerateArray()
                    .Select(c => c.ValueKind == JsonValueKind.String ? c.GetString() ?? "" : c.ToString())
                    .ToList();
                sb.AppendLine(string.Join(",", cols.Select(Escape)));

                if (!TryGetProperty(section, "rows", out var rows) &&
                    !TryGetProperty(section, "Rows", out rows))
                {
                    sb.AppendLine();
                    continue;
                }

                if (rows.ValueKind == JsonValueKind.Array)
                {
                    foreach (var row in rows.EnumerateArray())
                    {
                        if (row.ValueKind != JsonValueKind.Array) continue;
                        var cells = row.EnumerateArray()
                            .Select(c => c.ValueKind == JsonValueKind.String ? c.GetString() ?? "" : c.ToString())
                            .Select(Escape);
                        sb.AppendLine(string.Join(",", cells));
                    }
                }
                sb.AppendLine();
            }
        }

        var note = GetString(root, "summaryNote") ?? GetString(root, "SummaryNote");
        if (!string.IsNullOrEmpty(note))
            sb.AppendLine($"Note,{Escape(note)}");

        return sb.ToString();
    }

    private static void RenderSummary(ColumnDescriptor col, JsonElement root)
    {
        if (!TryGetProperty(root, "summary", out var summary) &&
            !TryGetProperty(root, "Summary", out summary))
            return;
        if (summary.ValueKind != JsonValueKind.Array || summary.GetArrayLength() == 0)
            return;

        col.Item().Text("Summary").FontSize(10).Bold();
        var parts = summary.EnumerateArray()
            .Select(s =>
            {
                var label = GetString(s, "label") ?? GetString(s, "Label") ?? "";
                var value = GetString(s, "value") ?? GetString(s, "Value") ?? "";
                return $"{label}: {value}";
            });
        col.Item().PaddingBottom(8).Text(string.Join("  ·  ", parts));
    }

    private static void RenderSections(ColumnDescriptor col, JsonElement root)
    {
        if (!TryGetProperty(root, "sections", out var sections) &&
            !TryGetProperty(root, "Sections", out sections))
            return;
        if (sections.ValueKind != JsonValueKind.Array) return;

        foreach (var section in sections.EnumerateArray())
        {
            var title = GetString(section, "title") ?? GetString(section, "Title") ?? "Section";
            if (!TryGetProperty(section, "columns", out var columns) &&
                !TryGetProperty(section, "Columns", out columns))
                continue;
            if (columns.ValueKind != JsonValueKind.Array || columns.GetArrayLength() == 0)
                continue;

            var colCount = columns.GetArrayLength();
            var headers = columns.EnumerateArray()
                .Select(c => c.ValueKind == JsonValueKind.String ? c.GetString() ?? "" : c.ToString())
                .ToList();
            var numeric = new bool[colCount];
            if (TryGetProperty(section, "numericFlags", out var flags) ||
                TryGetProperty(section, "NumericFlags", out flags))
            {
                if (flags.ValueKind == JsonValueKind.Array)
                {
                    var i = 0;
                    foreach (var f in flags.EnumerateArray())
                    {
                        if (i >= colCount) break;
                        numeric[i++] = f.ValueKind == JsonValueKind.True ||
                                       (f.ValueKind == JsonValueKind.String && bool.TryParse(f.GetString(), out var b) && b);
                    }
                }
            }

            var rowsList = new List<List<string>>();
            if ((TryGetProperty(section, "rows", out var rows) || TryGetProperty(section, "Rows", out rows))
                && rows.ValueKind == JsonValueKind.Array)
            {
                foreach (var row in rows.EnumerateArray())
                {
                    if (row.ValueKind != JsonValueKind.Array) continue;
                    var cells = row.EnumerateArray()
                        .Select(c => c.ValueKind == JsonValueKind.String ? c.GetString() ?? "" : c.ToString())
                        .ToList();
                    while (cells.Count < colCount) cells.Add("");
                    if (cells.Count > colCount) cells = cells.Take(colCount).ToList();
                    rowsList.Add(cells);
                }
            }

            var widths = ComputeColumnWidths(headers, rowsList, numeric);

            col.Item().PaddingTop(6).Text(title).FontSize(10).Bold();
            col.Item().PaddingBottom(6).Table(table =>
            {
                table.ColumnsDefinition(c =>
                {
                    for (var i = 0; i < colCount; i++)
                        c.RelativeColumn(widths[i]);
                });
                table.Header(h =>
                {
                    for (var i = 0; i < colCount; i++)
                    {
                        var cell = h.Cell().Element(HeaderCell);
                        if (numeric[i]) cell.AlignRight().Text(headers[i]);
                        else cell.Text(headers[i]);
                    }
                });

                foreach (var cells in rowsList)
                {
                    for (var i = 0; i < colCount; i++)
                    {
                        var text = i < cells.Count ? cells[i] : "";
                        var cell = table.Cell().Element(BodyCell);
                        if (numeric[i]) cell.AlignRight().Text(text);
                        else cell.Text(text);
                    }
                }
            });
        }
    }

    /// <summary>
    /// Content-weighted relative widths so narrow numeric columns don't crowd text columns.
    /// </summary>
    private static float[] ComputeColumnWidths(List<string> headers, List<List<string>> rows, bool[] numeric)
    {
        var n = headers.Count;
        var scores = new float[n];
        for (var i = 0; i < n; i++)
        {
            var maxLen = headers[i]?.Length ?? 0;
            foreach (var row in rows)
            {
                if (i < row.Count)
                    maxLen = Math.Max(maxLen, row[i]?.Length ?? 0);
            }

            // Soft floor/ceiling so tiny or huge cells don't dominate layout
            var clamped = Math.Clamp(maxLen, 4, 36);
            // Prefer slightly wider text columns; keep numeric columns compact
            scores[i] = numeric[i] ? Math.Max(1.0f, clamped * 0.55f) : Math.Max(1.4f, clamped * 0.85f);
        }

        return scores;
    }

    private static IContainer HeaderCell(IContainer c) =>
        c.DefaultTextStyle(x => x.SemiBold().FontSize(7))
            .PaddingVertical(3)
            .PaddingHorizontal(2)
            .BorderBottom(1)
            .BorderColor(Colors.Grey.Lighten1);

    private static IContainer BodyCell(IContainer c) =>
        c.PaddingVertical(2)
            .PaddingHorizontal(2)
            .BorderBottom(0.5f)
            .BorderColor(Colors.Grey.Lighten3);

    private static bool TryGetProperty(JsonElement root, string name, out JsonElement value)
    {
        if (root.ValueKind == JsonValueKind.Object && root.TryGetProperty(name, out value))
            return true;
        value = default;
        return false;
    }

    private static string? GetString(JsonElement el, string name)
    {
        if (!TryGetProperty(el, name, out var v)) return null;
        return v.ValueKind == JsonValueKind.String ? v.GetString() : v.ToString();
    }

    private static string Escape(string value)
    {
        if (value.Contains(',') || value.Contains('"') || value.Contains('\n'))
            return $"\"{value.Replace("\"", "\"\"")}\"";
        return value;
    }
}
