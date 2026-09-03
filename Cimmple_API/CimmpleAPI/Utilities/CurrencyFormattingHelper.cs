using System;
using System.Collections.Generic;
using System.Globalization;

namespace CimmpleAPI.Utilities
{
  public static class CurrencyFormattingHelper
  {
    private static readonly Dictionary<string, string> SymbolFallback = new(StringComparer.OrdinalIgnoreCase)
    {
      ["USD"] = "$",
      ["EUR"] = "€",
      ["GBP"] = "£",
      ["JPY"] = "¥",
      ["CNY"] = "¥",
      ["INR"] = "₹",
      ["CAD"] = "C$",
      ["AUD"] = "A$",
    };

    public static string DeriveCurrencySymbol(string currencyCode, string locale = "en-US")
    {
      var code = string.IsNullOrWhiteSpace(currencyCode) ? "USD" : currencyCode.Trim();

      try
      {
        foreach (var culture in CultureInfo.GetCultures(CultureTypes.SpecificCultures))
        {
          try
          {
            var region = new RegionInfo(culture.Name);
            if (string.Equals(region.ISOCurrencySymbol, code, StringComparison.OrdinalIgnoreCase))
              return region.CurrencySymbol;
          }
          catch (ArgumentException)
          {
            // Some culture names are not valid for RegionInfo
          }
        }
      }
      catch
      {
        // ignore culture enumeration failures
      }

      return SymbolFallback.TryGetValue(code, out var fallback) ? fallback : code;
    }

    public static string ResolveCurrencySymbol(
      string currencyCode,
      string configuredSymbol,
      string locale = "en-US")
    {
      var code = string.IsNullOrWhiteSpace(currencyCode) ? "USD" : currencyCode.Trim();
      var configured = (configuredSymbol ?? "").Trim();
      var derived = DeriveCurrencySymbol(code, locale);

      if (string.IsNullOrEmpty(configured))
        return derived;

      if (configured == "$" && !string.Equals(code, "USD", StringComparison.OrdinalIgnoreCase))
        return derived;

      return configured;
    }

    public static string FormatAmount(
      decimal amount,
      string currencyCode,
      string configuredSymbol,
      string locale,
      int decimalPlaces,
      string decimalSeparator,
      string thousandsSeparator)
    {
      var symbol = ResolveCurrencySymbol(currencyCode, configuredSymbol, locale);
      var dp = decimalPlaces > 0 ? decimalPlaces : 2;
      var cultureName = string.IsNullOrWhiteSpace(locale) ? "en-US" : locale;

      try
      {
        var culture = (CultureInfo)CultureInfo.CreateSpecificCulture(cultureName).Clone();
        culture.NumberFormat.CurrencySymbol = symbol;
        culture.NumberFormat.CurrencyDecimalDigits = dp;
        if (!string.IsNullOrWhiteSpace(decimalSeparator))
          culture.NumberFormat.CurrencyDecimalSeparator = decimalSeparator;
        if (!string.IsNullOrWhiteSpace(thousandsSeparator))
          culture.NumberFormat.CurrencyGroupSeparator = thousandsSeparator;
        return amount.ToString("C", culture);
      }
      catch
      {
        return symbol + amount.ToString($"F{dp}");
      }
    }
  }
}
