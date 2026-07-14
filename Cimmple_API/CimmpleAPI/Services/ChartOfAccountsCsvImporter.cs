using System.Globalization;
using System.Text;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services;

public sealed class CoaImportResult
{
    public int Updated { get; set; }
    public int Inserted { get; set; }
    public int Skipped { get; set; }
}

/// <summary>
/// Imports ChartofAccounts rows from a CSV export (no header row).
/// Columns: AccountID, AccountCode, AccountName, AccountType, IsActive, Groupid, Subgroupid, Subgroupid2, Subgroupid3, Linegroupid, Tenantid, MainGroup
/// </summary>
public static class ChartOfAccountsCsvImporter
{
    public static CoaImportResult Import(CimmpleDbContext db, string csvPath)
    {
        var lines = File.ReadAllLines(csvPath, Encoding.UTF8);
        var result = new CoaImportResult();

        using var tx = db.Database.BeginTransaction();
        try
        {
            foreach (var line in lines)
            {
                if (string.IsNullOrWhiteSpace(line))
                    continue;

                var cols = ParseCsvLine(line);
                if (cols.Count > 0 && string.Equals(cols[0].Trim(), "AccountID", StringComparison.OrdinalIgnoreCase))
                    continue;

                if (cols.Count < 12)
                {
                    result.Skipped++;
                    continue;
                }

                if (!int.TryParse(cols[0].Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var accountId) || accountId <= 0)
                {
                    result.Skipped++;
                    continue;
                }

                if (!int.TryParse(cols[10].Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var tenantId))
                {
                    result.Skipped++;
                    continue;
                }

                var accountCode = cols[1].Trim();
                var accountName = cols[2].Trim().Trim('"').Trim();
                var accountType = NormalizeAccountType(cols[3].Trim());
                var isActive = ParseBool(cols[4]);
                var groupId = ParseNullableInt(cols[5]);
                var subgroupId = ParseNullableInt(cols[6]);
                var subgroupId2 = ParseNullableInt(cols[7]);
                var subgroupId3 = ParseNullableInt(cols[8]);
                var lineGroupId = ParseNullableInt(cols[9]);
                var mainGroup = cols[11].Trim().Trim('"').Trim();

                var existing = db.ChartofAccounts.Find(accountId);
                if (existing != null)
                {
                    existing.AccountCode = accountCode;
                    existing.AccountName = accountName;
                    existing.AccountType = accountType;
                    existing.IsActive = isActive;
                    existing.Groupid = groupId;
                    existing.Subgroupid = subgroupId;
                    existing.Subgroupid2 = subgroupId2;
                    existing.Subgroupid3 = subgroupId3;
                    existing.Linegroupid = lineGroupId;
                    existing.Tenantid = tenantId;
                    existing.MainGroup = mainGroup;
                    result.Updated++;
                }
                else
                {
                    db.Database.ExecuteSqlRaw("SET IDENTITY_INSERT dbo.ChartofAccounts ON");
                    try
                    {
                        db.ChartofAccounts.Add(new ChartofAccounts
                        {
                            AccountID = accountId,
                            AccountCode = accountCode,
                            AccountName = accountName,
                            AccountType = accountType,
                            IsActive = isActive,
                            Groupid = groupId,
                            Subgroupid = subgroupId,
                            Subgroupid2 = subgroupId2,
                            Subgroupid3 = subgroupId3,
                            Linegroupid = lineGroupId,
                            Tenantid = tenantId,
                            MainGroup = mainGroup
                        });
                        db.SaveChanges();
                        result.Inserted++;
                    }
                    finally
                    {
                        db.Database.ExecuteSqlRaw("SET IDENTITY_INSERT dbo.ChartofAccounts OFF");
                    }
                }
            }

            db.SaveChanges();
            tx.Commit();
        }
        catch
        {
            tx.Rollback();
            throw;
        }

        return result;
    }

    private static string NormalizeAccountType(string t) =>
        string.Equals(t, "Liabilities", StringComparison.OrdinalIgnoreCase) ? "Liability" : t;

    private static bool ParseBool(string s)
    {
        var t = s.Trim();
        return t is "1" or "true" or "True";
    }

    private static int? ParseNullableInt(string s)
    {
        var t = s.Trim();
        if (t.Length == 0 || string.Equals(t, "NULL", StringComparison.OrdinalIgnoreCase))
            return null;
        if (!int.TryParse(t, NumberStyles.Integer, CultureInfo.InvariantCulture, out var n))
            return null;
        if (n is -1 or -2)
            return null;
        return n;
    }

    private static List<string> ParseCsvLine(string line)
    {
        var fields = new List<string>();
        var sb = new StringBuilder();
        var inQuotes = false;
        for (var i = 0; i < line.Length; i++)
        {
            var c = line[i];
            if (c == '"')
            {
                inQuotes = !inQuotes;
                continue;
            }

            if (c == ',' && !inQuotes)
            {
                fields.Add(sb.ToString());
                sb.Clear();
                continue;
            }

            sb.Append(c);
        }

        fields.Add(sb.ToString());
        return fields;
    }
}
