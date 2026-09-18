using System.Globalization;

namespace CimmpleAPI.Services;

public sealed class ReportStatDto
{
    public string Label { get; set; } = "";
    public string Value { get; set; } = "";
    public bool Warn { get; set; }
}

/// <summary>Optional drill item under a report row (invoice, PO, NCR, etc.).</summary>
public sealed class ReportDrillItemDto
{
    public string Label { get; set; } = "";
    public string SubLabel { get; set; } = "";
    public string Date { get; set; } = "";
    public string Status { get; set; } = "";
    public string Amount { get; set; } = "";
    public int? EntityId { get; set; }
    public string LinkPath { get; set; } = "";
}

/// <summary>Parallel meta for a section row — enables overlay drill-down in the UI.</summary>
public sealed class ReportRowMetaDto
{
    public string EntityType { get; set; } = "";
    public int? EntityId { get; set; }
    public string? EntityKey { get; set; }
    public string Title { get; set; } = "";
    public string LinkPath { get; set; } = "";
    public List<ReportDrillItemDto> Details { get; set; } = new();
}

public sealed class ReportSectionDto
{
    public string Title { get; set; } = "";
    public List<string> Columns { get; set; } = new();
    /// <summary>True when the column should be right-aligned (numeric).</summary>
    public List<bool> NumericFlags { get; set; } = new();
    public List<List<string>> Rows { get; set; } = new();
    /// <summary>Aligned with Rows by index; null entry means the row is not drillable.</summary>
    public List<ReportRowMetaDto?> RowMeta { get; set; } = new();
}

public sealed class ReportResultDto
{
    public string ReportType { get; set; } = "";
    public string ReportTypeKey { get; set; } = "";
    public string PeriodStart { get; set; } = "";
    public string PeriodEnd { get; set; } = "";
    public int? LocationId { get; set; }
    public List<ReportStatDto> Summary { get; set; } = new();
    public string? SummaryNote { get; set; }
    public List<ReportSectionDto> Sections { get; set; } = new();
}

public static class ReportResultFactory
{
    public static ReportResultDto Create(
        string reportTypeKey,
        string reportType,
        DateTime start,
        DateTime end,
        int? locationId)
    {
        return new ReportResultDto
        {
            ReportTypeKey = reportTypeKey,
            ReportType = reportType,
            PeriodStart = start.Date.ToString("yyyy-MM-dd"),
            PeriodEnd = end.Date.ToString("yyyy-MM-dd"),
            LocationId = locationId,
        };
    }

    public static string Money(decimal n) =>
        n.ToString("C2", CultureInfo.GetCultureInfo("en-US"));

    public static string Qty(decimal n) =>
        n.ToString("0.##", CultureInfo.InvariantCulture);

    public static string Pct(decimal n) =>
        n.ToString("0.##", CultureInfo.InvariantCulture) + "%";

    public static string Num(int n) =>
        n.ToString("N0", CultureInfo.InvariantCulture);

    public static string Num(decimal n) =>
        n.ToString("0.##", CultureInfo.InvariantCulture);

    public static string Days(double n) =>
        n.ToString("0.#", CultureInfo.InvariantCulture);

    public static ReportSectionDto Section(string title, params string[] columns)
    {
        return new ReportSectionDto
        {
            Title = title,
            Columns = columns.ToList(),
            NumericFlags = columns.Select(_ => false).ToList(),
            Rows = new List<List<string>>(),
            RowMeta = new List<ReportRowMetaDto?>(),
        };
    }

    public static ReportSectionDto WithNumeric(this ReportSectionDto section, params int[] numericColumnIndexes)
    {
        var set = new HashSet<int>(numericColumnIndexes);
        section.NumericFlags = section.Columns
            .Select((_, i) => set.Contains(i))
            .ToList();
        return section;
    }

    public static void AddRow(this ReportSectionDto section, params string?[] cells)
    {
        section.AddRow(null, cells);
    }

    public static void AddRow(this ReportSectionDto section, ReportRowMetaDto? meta, params string?[] cells)
    {
        section.Rows.Add(cells.Select(c => c ?? "").ToList());
        section.RowMeta.Add(meta);
    }

    public static void AddStat(this ReportResultDto report, string label, string value, bool warn = false)
    {
        report.Summary.Add(new ReportStatDto { Label = label, Value = value, Warn = warn });
    }
}
