using System.Globalization;
using System.Text;
using ClosedXML.Excel;

namespace CimmpleAPI.Services.Tenancy
{
    public sealed class TabularRow
    {
        public int RowNumber { get; init; }
        public Dictionary<string, string> Cells { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    }

    public static class TabularFileParser
    {
        public const int MaxRows = 2000;

        public static List<TabularRow> Parse(Stream stream, string fileName, string? preferredSheet = null)
        {
            var ext = Path.GetExtension(fileName).ToLowerInvariant();
            if (ext is ".xlsx" or ".xlsm")
                return ParseExcel(stream, preferredSheet);
            if (ext is ".csv" or ".txt")
                return ParseCsv(stream);
            throw new InvalidOperationException("Upload a CSV or Excel (.xlsx) file.");
        }

        public static bool HasSheet(Stream stream, string sheetName)
        {
            using var workbook = new XLWorkbook(stream);
            return workbook.Worksheets.Any(w => string.Equals(w.Name, sheetName, StringComparison.OrdinalIgnoreCase));
        }

        private static List<TabularRow> ParseExcel(Stream stream, string? preferredSheet)
        {
            using var workbook = new XLWorkbook(stream);
            var sheet = workbook.Worksheets.FirstOrDefault(w =>
                    preferredSheet != null && string.Equals(w.Name, preferredSheet, StringComparison.OrdinalIgnoreCase))
                ?? workbook.Worksheets.FirstOrDefault()
                ?? throw new InvalidOperationException("The workbook has no sheets.");

            var used = sheet.RangeUsed();
            if (used == null) return new List<TabularRow>();

            var headerRow = used.FirstRow().RowNumber();
            var headers = new Dictionary<int, string>();
            foreach (var cell in sheet.Row(headerRow).CellsUsed())
            {
                var name = cell.GetString().Trim();
                if (name.Length > 0) headers[cell.Address.ColumnNumber] = name;
            }
            if (headers.Count == 0) throw new InvalidOperationException("The first row must be column headings.");

            var rows = new List<TabularRow>();
            var last = used.LastRow().RowNumber();
            for (var r = headerRow + 1; r <= last; r++)
            {
                var cells = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                var any = false;
                foreach (var header in headers)
                {
                    var value = sheet.Cell(r, header.Key).GetString().Trim();
                    if (value.Length > 0) any = true;
                    cells[header.Value] = value;
                }
                if (!any) continue;
                rows.Add(new TabularRow { RowNumber = r, Cells = cells });
                if (rows.Count > MaxRows)
                    throw new InvalidOperationException($"A file can contain at most {MaxRows} data rows.");
            }
            return rows;
        }

        private static List<TabularRow> ParseCsv(Stream stream)
        {
            using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, leaveOpen: true);
            var text = reader.ReadToEnd();
            var table = ReadCsv(text);
            if (table.Count == 0) return new List<TabularRow>();

            var headers = table[0].Select(h => h.Trim()).ToList();
            if (headers.All(string.IsNullOrEmpty))
                throw new InvalidOperationException("The first row must be column headings.");

            var rows = new List<TabularRow>();
            for (var i = 1; i < table.Count; i++)
            {
                var cells = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                var any = false;
                for (var c = 0; c < headers.Count && c < table[i].Count; c++)
                {
                    if (string.IsNullOrEmpty(headers[c])) continue;
                    var value = table[i][c].Trim();
                    if (value.Length > 0) any = true;
                    cells[headers[c]] = value;
                }
                if (!any) continue;
                rows.Add(new TabularRow { RowNumber = i + 1, Cells = cells });
                if (rows.Count > MaxRows)
                    throw new InvalidOperationException($"A file can contain at most {MaxRows} data rows.");
            }
            return rows;
        }

        private static List<List<string>> ReadCsv(string text)
        {
            var rows = new List<List<string>>();
            var row = new List<string>();
            var field = new StringBuilder();
            var quoted = false;
            for (var i = 0; i < text.Length; i++)
            {
                var ch = text[i];
                if (quoted)
                {
                    if (ch == '"')
                    {
                        if (i + 1 < text.Length && text[i + 1] == '"') { field.Append('"'); i++; }
                        else quoted = false;
                    }
                    else field.Append(ch);
                    continue;
                }
                if (ch == '"') { quoted = true; continue; }
                if (ch == ',') { row.Add(field.ToString()); field.Clear(); continue; }
                if (ch == '\r') continue;
                if (ch == '\n')
                {
                    row.Add(field.ToString());
                    field.Clear();
                    rows.Add(row);
                    row = new List<string>();
                    continue;
                }
                field.Append(ch);
            }
            if (field.Length > 0 || row.Count > 0)
            {
                row.Add(field.ToString());
                rows.Add(row);
            }
            return rows;
        }

        public static string Cell(TabularRow row, params string[] names)
        {
            foreach (var name in names)
            {
                if (row.Cells.TryGetValue(name, out var value) && !string.IsNullOrWhiteSpace(value))
                    return value.Trim();
            }
            return "";
        }

        public static int? Int(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            return int.TryParse(value.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) ? n : null;
        }

        public static decimal? Decimal(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            return decimal.TryParse(value.Trim(), NumberStyles.Number, CultureInfo.InvariantCulture, out var n) ? n : null;
        }
    }
}
