using System.Globalization;

namespace CimmpleAPI.Services.Pdf
{
    public static class PdfDateFormatting
    {
        public const string DefaultFormat = "MM/dd/yyyy";

        public static string Format(DateTime? date, string? format)
        {
            if (!date.HasValue) return "";
            var pattern = string.IsNullOrWhiteSpace(format) ? DefaultFormat : format.Trim();
            try
            {
                return date.Value.ToString(pattern, CultureInfo.InvariantCulture);
            }
            catch (FormatException)
            {
                return date.Value.ToString(DefaultFormat, CultureInfo.InvariantCulture);
            }
        }
    }
}
