using System.Threading;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;

namespace CimmpleAPI.Services;

/// <summary>
/// Sets <see cref="ChartofAccounts.Groupid"/> on accounts that already store a main-group
/// name. Provisioning now writes both; tenants created before that only have the name.
/// Creates the matching <see cref="MainGroup"/> row when the tenant does not have one.
/// Safe to run more than once.
/// </summary>
public static class ChartOfAccountsMainGroupBackfill
{
    private static readonly SemaphoreSlim Gate = new(1, 1);
    private static int _done;

    /// <returns>Accounts linked on this call, or null when a previous call in this process already finished.</returns>
    public static int? Ensure(CimmpleDbContext db)
    {
        if (Volatile.Read(ref _done) == 1)
            return null;

        Gate.Wait();
        try
        {
            if (Volatile.Read(ref _done) == 1)
                return null;

            var linked = Link(db);
            Volatile.Write(ref _done, 1);
            return linked;
        }
        finally
        {
            Gate.Release();
        }
    }

    /// <returns>Number of accounts whose Groupid was set.</returns>
    public static int Link(CimmpleDbContext db)
    {
        var accounts = db.ChartofAccounts
            .Where(a => (a.Groupid == null || a.Groupid == 0)
                && a.MainGroup != null
                && a.MainGroup != "")
            .ToList();

        var pending = new List<(ChartofAccounts Account, string Name)>();
        foreach (var account in accounts)
        {
            var name = (account.MainGroup ?? "").Trim();
            if (name.Length > 0)
                pending.Add((account, name));
        }

        if (pending.Count == 0)
            return 0;

        var tenantIds = pending.Select(x => x.Account.Tenantid).Distinct().ToList();
        var existing = db.MainGroup.Where(m => tenantIds.Contains(m.tenantid)).ToList();

        var byName = new Dictionary<int, Dictionary<string, int>>();
        var maxId = new Dictionary<int, int>();
        foreach (var group in existing)
        {
            if (!byName.TryGetValue(group.tenantid, out var names))
            {
                names = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                byName[group.tenantid] = names;
            }

            var name = group.MainGroupName?.Trim();
            if (!string.IsNullOrEmpty(name) && !names.ContainsKey(name))
                names[name] = group.MainGroupID;

            maxId[group.tenantid] = maxId.TryGetValue(group.tenantid, out var current)
                ? Math.Max(current, group.MainGroupID)
                : group.MainGroupID;
        }

        var linked = 0;
        foreach (var (account, name) in pending)
        {
            if (!byName.TryGetValue(account.Tenantid, out var names))
            {
                names = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                byName[account.Tenantid] = names;
            }

            if (!names.TryGetValue(name, out var groupId))
            {
                groupId = maxId.TryGetValue(account.Tenantid, out var current) ? current + 1 : 1;
                maxId[account.Tenantid] = groupId;
                db.MainGroup.Add(new MainGroup
                {
                    MainGroupID = groupId,
                    MainGroupName = name,
                    accountId = 0,
                    tenantid = account.Tenantid
                });
                names[name] = groupId;
            }

            account.Groupid = groupId;
            linked++;
        }

        if (linked > 0)
            db.SaveChanges();

        return linked;
    }
}
