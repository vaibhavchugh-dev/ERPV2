using System.Collections.Generic;
using System.Linq;

namespace CimmpleAPI.Services;

/// <summary>
/// Resolves explicit site filter vs restricted multi-site "All sites" for operational reports.
/// </summary>
public static class ReportLocationScope
{
    /// <summary>
    /// Returns null when unrestricted (tenant-wide). Otherwise the allowed location id list
    /// (may be empty when the user has no assigned sites).
    /// </summary>
    public static List<int>? Resolve(int? locationId, IReadOnlyList<int>? restrictToLocationIds)
    {
        if (locationId.HasValue && locationId.Value > 0)
            return new List<int> { locationId.Value };
        if (restrictToLocationIds != null)
            return restrictToLocationIds.ToList();
        return null;
    }
}
