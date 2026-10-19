using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Partial convert support: stamp VQ lines with the VO they became,
    /// derive Partially Converted vs Converted, and resolve linked order chips.
    /// </summary>
    public static class VendorQuotationConversionService
    {
        public const string StatusPartiallyConverted = "Partially Converted";
        public const string StatusConverted = "Converted";

        public static bool IsConvertibleLine(VendorQuotationsDetails d)
        {
            if (d == null) return false;
            var name = (d.itemname ?? "").Trim();
            var part = (d.PartNo ?? "").Trim();
            return name.Length > 0 || part.Length > 0 || d.QtyOrdered > 0;
        }

        public static bool IsLineConverted(VendorQuotationsDetails d) =>
            d.ConvertedVendorOrderId.HasValue && d.ConvertedVendorOrderId.Value > 0;

        /// <summary>
        /// Stamp selected quotation lines with the new vendor order id (skips already-stamped lines).
        /// </summary>
        public static async Task StampLinesAsync(
            CimmpleDbContext context,
            int tenantId,
            int quotationId,
            int vendorOrderId,
            IEnumerable<int> itemNos,
            CancellationToken cancellationToken = default)
        {
            var itemNoSet = itemNos?.Where(n => n > 0).Distinct().ToHashSet() ?? new HashSet<int>();
            if (itemNoSet.Count == 0 || vendorOrderId <= 0) return;

            var lines = await context.VendorQuotationsDetails
                .Where(d => d.OrderID == quotationId && d.Tenantid == tenantId && itemNoSet.Contains(d.ItemNo))
                .ToListAsync(cancellationToken);

            foreach (var line in lines)
            {
                if (!IsConvertibleLine(line)) continue;
                if (IsLineConverted(line)) continue;
                line.ConvertedVendorOrderId = vendorOrderId;
            }
        }

        /// <summary>
        /// Stamp VQ lines from a saved VO. Matches by ItemNo first, then PartNo / PartName
        /// so Compare "Create Orders" still stamps correctly when VO lines were renumbered 1..n.
        /// </summary>
        public static async Task StampLinesFromVendorOrderAsync(
            CimmpleDbContext context,
            int tenantId,
            int quotationId,
            int vendorOrderId,
            CancellationToken cancellationToken = default)
        {
            if (vendorOrderId <= 0 || quotationId <= 0) return;

            var orderDetails = await context.VendorOrderDetails
                .AsNoTracking()
                .Where(d => d.OrderID == vendorOrderId && d.Tenantid == tenantId)
                .Select(d => new { d.ItemNo, d.PartNo, d.PartName })
                .ToListAsync(cancellationToken);
            if (orderDetails.Count == 0) return;

            var quoteLines = await context.VendorQuotationsDetails
                .Where(d => d.OrderID == quotationId && d.Tenantid == tenantId)
                .ToListAsync(cancellationToken);

            foreach (var od in orderDetails)
            {
                var partNo = (od.PartNo ?? "").Trim();
                var partName = (od.PartName ?? "").Trim();
                VendorQuotationsDetails? line = null;

                // Prefer PartNo — Compare Create Orders may renumber VO ItemNo to 1..n.
                if (partNo.Length > 0)
                {
                    line = quoteLines.FirstOrDefault(q =>
                        !IsLineConverted(q) &&
                        IsConvertibleLine(q) &&
                        string.Equals((q.PartNo ?? "").Trim(), partNo, StringComparison.OrdinalIgnoreCase));
                }

                if (line == null && od.ItemNo > 0)
                {
                    line = quoteLines.FirstOrDefault(q =>
                        !IsLineConverted(q) && IsConvertibleLine(q) && q.ItemNo == od.ItemNo);
                    // Reject ItemNo hit when PartNo is present and disagrees.
                    if (line != null && partNo.Length > 0)
                    {
                        var qPart = (line.PartNo ?? "").Trim();
                        if (qPart.Length > 0 &&
                            !string.Equals(qPart, partNo, StringComparison.OrdinalIgnoreCase))
                            line = null;
                    }
                }

                if (line == null && partName.Length > 0)
                {
                    line = quoteLines.FirstOrDefault(q =>
                        !IsLineConverted(q) &&
                        IsConvertibleLine(q) &&
                        string.Equals((q.itemname ?? "").Trim(), partName, StringComparison.OrdinalIgnoreCase));
                }

                if (line != null)
                    line.ConvertedVendorOrderId = vendorOrderId;
            }
        }

        /// <summary>
        /// True when every convertible line on the master RFQ is covered by a live stamp
        /// on any quotation in the group (same ItemNo / PartNo / PartName). Used to hide
        /// Compare after multi-vendor split converts.
        /// </summary>
        public static async Task<bool> AreAllMasterLinesCoveredAsync(
            CimmpleDbContext context,
            int tenantId,
            int masterQuotationId,
            int? excludeOrderId = null,
            CancellationToken cancellationToken = default)
        {
            var master = await context.VendorQuotations
                .AsNoTracking()
                .FirstOrDefaultAsync(q => q.OrderID == masterQuotationId && q.Tenantid == tenantId, cancellationToken);
            if (master == null) return false;

            var masterId = GetMasterId(master);
            if (masterId != master.OrderID)
            {
                master = await context.VendorQuotations
                    .AsNoTracking()
                    .FirstOrDefaultAsync(q => q.OrderID == masterId && q.Tenantid == tenantId, cancellationToken);
                if (master == null) return false;
            }

            // Tracked (not AsNoTracking) so unsaved stamps from StampLines* in the same request are visible.
            var masterDetails = await context.VendorQuotationsDetails
                .Where(d => d.OrderID == masterId && d.Tenantid == tenantId)
                .ToListAsync(cancellationToken);
            var masterConvertible = masterDetails.Where(IsConvertibleLine).ToList();
            if (masterConvertible.Count == 0) return false;

            var groupIds = await GetGroupQuotationIdsAsync(context, master, cancellationToken);
            var groupDetails = await context.VendorQuotationsDetails
                .Where(d => d.Tenantid == tenantId && groupIds.Contains(d.OrderID))
                .ToListAsync(cancellationToken);

            bool StillLive(VendorQuotationsDetails d) =>
                IsLineConverted(d) &&
                (!excludeOrderId.HasValue || d.ConvertedVendorOrderId != excludeOrderId.Value);

            var candidateStampIds = groupDetails
                .Where(StillLive)
                .Select(d => d.ConvertedVendorOrderId!.Value)
                .Distinct()
                .ToList();
            if (candidateStampIds.Count == 0) return false;

            var existingStampIds = await context.VendorOrders
                .AsNoTracking()
                .Where(o => o.Tenantid == tenantId && candidateStampIds.Contains(o.OrderID))
                .Select(o => o.OrderID)
                .ToListAsync(cancellationToken);
            if (excludeOrderId.HasValue)
                existingStampIds = existingStampIds.Where(id => id != excludeOrderId.Value).ToList();
            if (existingStampIds.Count == 0) return false;

            var liveStamped = groupDetails
                .Where(d => StillLive(d) && existingStampIds.Contains(d.ConvertedVendorOrderId!.Value))
                .ToList();

            foreach (var masterLine in masterConvertible)
            {
                if (!liveStamped.Any(d => LinesMatch(masterLine, d)))
                    return false;
            }
            return true;
        }

        public static bool LinesMatch(VendorQuotationsDetails a, VendorQuotationsDetails b)
        {
            if (a == null || b == null) return false;
            if (a.ItemNo > 0 && a.ItemNo == b.ItemNo) return true;

            var aPart = (a.PartNo ?? "").Trim();
            var bPart = (b.PartNo ?? "").Trim();
            if (aPart.Length > 0 &&
                string.Equals(aPart, bPart, StringComparison.OrdinalIgnoreCase))
                return true;

            var aName = (a.itemname ?? "").Trim();
            var bName = (b.itemname ?? "").Trim();
            return aName.Length > 0 &&
                   string.Equals(aName, bName, StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>Clear line stamps pointing at a deleted vendor order. Returns affected quotation ids.</summary>
        public static async Task<List<int>> ClearLinesForOrderAsync(
            CimmpleDbContext context,
            int tenantId,
            int vendorOrderId,
            CancellationToken cancellationToken = default)
        {
            if (vendorOrderId <= 0) return new List<int>();

            var lines = await context.VendorQuotationsDetails
                .Where(d => d.Tenantid == tenantId && d.ConvertedVendorOrderId == vendorOrderId)
                .ToListAsync(cancellationToken);

            var quotationIds = lines.Select(d => d.OrderID).Distinct().ToList();
            foreach (var line in lines)
                line.ConvertedVendorOrderId = null;
            return quotationIds;
        }

        public static async Task RecalculateQuotationAsync(
            CimmpleDbContext context,
            VendorQuotations quotation,
            int? excludeOrderId = null,
            CancellationToken cancellationToken = default)
        {
            if (quotation == null) return;

            var details = await context.VendorQuotationsDetails
                .Where(d => d.OrderID == quotation.OrderID && d.Tenantid == quotation.Tenantid)
                .ToListAsync(cancellationToken);

            // Ignore stamps that point at an order being deleted (or already cleared).
            if (excludeOrderId.HasValue && excludeOrderId.Value > 0)
            {
                foreach (var d in details.Where(d => d.ConvertedVendorOrderId == excludeOrderId.Value))
                    d.ConvertedVendorOrderId = null;
            }

            var convertible = details.Where(IsConvertibleLine).ToList();
            var stampedIds = convertible
                .Where(IsLineConverted)
                .Select(d => d.ConvertedVendorOrderId!.Value)
                .Where(id => !excludeOrderId.HasValue || id != excludeOrderId.Value)
                .Distinct()
                .ToList();

            // Live VOs still linked to this quotation (exclude the one being deleted).
            var linkedOrdersQuery = context.VendorOrders
                .AsNoTracking()
                .Where(o => o.Tenantid == quotation.Tenantid &&
                            o.QuotationId == quotation.OrderID);
            if (excludeOrderId.HasValue && excludeOrderId.Value > 0)
                linkedOrdersQuery = linkedOrdersQuery.Where(o => o.OrderID != excludeOrderId.Value);

            var linkedOrders = await linkedOrdersQuery
                .Select(o => new { o.OrderID, o.PONumber })
                .ToListAsync(cancellationToken);

            // Also keep stamps whose VO still exists (and is not excluded).
            if (stampedIds.Count > 0)
            {
                var existingStampIds = await context.VendorOrders
                    .AsNoTracking()
                    .Where(o => o.Tenantid == quotation.Tenantid && stampedIds.Contains(o.OrderID))
                    .Select(o => o.OrderID)
                    .ToListAsync(cancellationToken);
                if (excludeOrderId.HasValue)
                    existingStampIds = existingStampIds.Where(id => id != excludeOrderId.Value).ToList();
                stampedIds = existingStampIds;
                foreach (var d in convertible.Where(IsLineConverted))
                {
                    if (!stampedIds.Contains(d.ConvertedVendorOrderId!.Value))
                        d.ConvertedVendorOrderId = null;
                }
            }

            // Legacy rows: header says converted but no line stamps — keep fully converted only
            // while a linked vendor order still exists (excluding deleted).
            var legacyFullyConverted =
                convertible.Count > 0 &&
                stampedIds.Count == 0 &&
                linkedOrders.Count > 0 &&
                (quotation.isconverted == 1 ||
                 string.Equals(quotation.Status, StatusConverted, StringComparison.OrdinalIgnoreCase) ||
                 (quotation.convertedOrderId.HasValue && quotation.convertedOrderId.Value > 0));

            if (legacyFullyConverted)
            {
                quotation.isconverted = 1;
                quotation.Status = StatusConverted;
                quotation.convertedOrderId = linkedOrders
                    .OrderByDescending(o => o.OrderID)
                    .Select(o => (int?)o.PONumber)
                    .FirstOrDefault();
                return;
            }

            var convertedCount = convertible.Count(IsLineConverted);

            if (convertible.Count == 0 || convertedCount == 0)
            {
                var wasConvertRelated =
                    quotation.isconverted == 1 ||
                    (quotation.Status ?? "").IndexOf("convert", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    (quotation.convertedOrderId.HasValue && quotation.convertedOrderId.Value > 0);
                quotation.isconverted = 0;
                quotation.convertedOrderId = null;
                if (wasConvertRelated)
                    quotation.Status = ResolveStatusAfterUnconvert(quotation);
                return;
            }

            var latestPo = await ResolveLatestPoNumberAsync(
                context, quotation.Tenantid, stampedIds, excludeOrderId, cancellationToken);
            quotation.convertedOrderId = latestPo;

            if (convertedCount < convertible.Count)
            {
                quotation.isconverted = 0;
                quotation.Status = StatusPartiallyConverted;
            }
            else
            {
                quotation.isconverted = 1;
                quotation.Status = StatusConverted;
            }
        }

        /// <summary>
        /// Recalculate the quotation and, when it is a child RFQ, roll conversion flags up to the master.
        /// </summary>
        public static async Task RecalculateQuotationAndMasterAsync(
            CimmpleDbContext context,
            VendorQuotations quotation,
            int? excludeOrderId = null,
            CancellationToken cancellationToken = default)
        {
            await RecalculateQuotationAsync(context, quotation, excludeOrderId, cancellationToken);

            var masterId = GetMasterId(quotation);
            if (masterId == quotation.OrderID) return;

            var master = await context.VendorQuotations
                .FirstOrDefaultAsync(
                    q => q.OrderID == masterId && q.Tenantid == quotation.Tenantid,
                    cancellationToken);
            if (master == null) return;

            await RecalculateMasterRollupAsync(context, master, excludeOrderId, cancellationToken);
        }

        public static async Task RecalculateMasterRollupAsync(
            CimmpleDbContext context,
            VendorQuotations master,
            int? excludeOrderId = null,
            CancellationToken cancellationToken = default)
        {
            var groupIds = await GetGroupQuotationIdsAsync(context, master, cancellationToken);
            var details = await context.VendorQuotationsDetails
                .Where(d => d.Tenantid == master.Tenantid && groupIds.Contains(d.OrderID))
                .ToListAsync(cancellationToken);

            if (excludeOrderId.HasValue && excludeOrderId.Value > 0)
            {
                foreach (var d in details.Where(d => d.ConvertedVendorOrderId == excludeOrderId.Value))
                    d.ConvertedVendorOrderId = null;
            }

            var convertible = details.Where(IsConvertibleLine).ToList();
            var stampedIds = convertible
                .Where(IsLineConverted)
                .Select(d => d.ConvertedVendorOrderId!.Value)
                .Where(id => !excludeOrderId.HasValue || id != excludeOrderId.Value)
                .Distinct()
                .ToList();

            if (stampedIds.Count > 0)
            {
                var existingStampIds = await context.VendorOrders
                    .AsNoTracking()
                    .Where(o => o.Tenantid == master.Tenantid && stampedIds.Contains(o.OrderID))
                    .Select(o => o.OrderID)
                    .ToListAsync(cancellationToken);
                if (excludeOrderId.HasValue)
                    existingStampIds = existingStampIds.Where(id => id != excludeOrderId.Value).ToList();
                stampedIds = existingStampIds;
            }

            var groupQuotations = await context.VendorQuotations
                .Where(q => q.Tenantid == master.Tenantid && groupIds.Contains(q.OrderID))
                .ToListAsync(cancellationToken);

            // Any remaining live VO linked to any quote in the group?
            var linkedOrderQuery = context.VendorOrders
                .AsNoTracking()
                .Where(o => o.Tenantid == master.Tenantid &&
                            o.QuotationId != null &&
                            groupIds.Contains(o.QuotationId.Value));
            if (excludeOrderId.HasValue && excludeOrderId.Value > 0)
                linkedOrderQuery = linkedOrderQuery.Where(o => o.OrderID != excludeOrderId.Value);
            var anyLinkedOrders = await linkedOrderQuery.AnyAsync(cancellationToken);

            var convertedCount = convertible.Count(d =>
                IsLineConverted(d) &&
                stampedIds.Contains(d.ConvertedVendorOrderId!.Value));

            if ((convertible.Count == 0 || convertedCount == 0) && !anyLinkedOrders)
            {
                if (master.isconverted == 1 ||
                    string.Equals(master.Status, StatusConverted, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(master.Status, StatusPartiallyConverted, StringComparison.OrdinalIgnoreCase) ||
                    (master.convertedOrderId.HasValue && master.convertedOrderId.Value > 0))
                {
                    master.isconverted = 0;
                    master.convertedOrderId = null;
                    master.Status = ResolveStatusAfterUnconvert(master);
                }
                return;
            }

            // Legacy: no stamps but some child still marked Converted with a live VO
            if (stampedIds.Count == 0 && anyLinkedOrders)
            {
                var anyChildConverted = groupQuotations.Any(q =>
                    q.OrderID != master.OrderID &&
                    (q.isconverted == 1 ||
                     string.Equals(q.Status, StatusConverted, StringComparison.OrdinalIgnoreCase)));
                if (anyChildConverted)
                {
                    master.isconverted = 1;
                    master.Status = StatusConverted;
                    master.convertedOrderId = groupQuotations
                        .Where(q => q.convertedOrderId.HasValue && q.convertedOrderId.Value > 0)
                        .Select(q => q.convertedOrderId!.Value)
                        .OrderByDescending(x => x)
                        .FirstOrDefault();
                    return;
                }
            }

            // Keep master's Status from its own lines only (not child-vendor converts).
            await RecalculateQuotationAsync(context, master, excludeOrderId, cancellationToken);

            // Listing chips / hide-Compare use group stamps; do not rewrite master Status here.
            master.convertedOrderId = await ResolveLatestPoNumberAsync(
                context, master.Tenantid, stampedIds, excludeOrderId, cancellationToken);

            var allMasterCovered = await AreAllMasterLinesCoveredAsync(
                context, master.Tenantid, master.OrderID, excludeOrderId, cancellationToken);
            master.isconverted = allMasterCovered ? 1 : master.isconverted;
        }

        public static async Task<bool> IsQuotationFullyConvertedAsync(
            CimmpleDbContext context,
            int tenantId,
            int quotationId,
            int? excludeOrderId = null,
            CancellationToken cancellationToken = default)
        {
            var quotation = await context.VendorQuotations
                .AsNoTracking()
                .FirstOrDefaultAsync(q => q.OrderID == quotationId && q.Tenantid == tenantId, cancellationToken);
            if (quotation == null) return false;

            var details = await context.VendorQuotationsDetails
                .AsNoTracking()
                .Where(d => d.OrderID == quotationId && d.Tenantid == tenantId)
                .ToListAsync(cancellationToken);

            var convertible = details.Where(IsConvertibleLine).ToList();
            if (convertible.Count == 0)
            {
                var hasLive = await HasLiveLinkedOrderAsync(
                    context, tenantId, quotationId, excludeOrderId, cancellationToken);
                return hasLive &&
                       (quotation.isconverted == 1 ||
                        string.Equals(quotation.Status, StatusConverted, StringComparison.OrdinalIgnoreCase));
            }

            bool LineStillConverted(VendorQuotationsDetails d) =>
                IsLineConverted(d) &&
                (!excludeOrderId.HasValue || d.ConvertedVendorOrderId != excludeOrderId.Value);

            if (convertible.All(LineStillConverted))
            {
                // Confirm stamp targets still exist
                var stampIds = convertible
                    .Select(d => d.ConvertedVendorOrderId!.Value)
                    .Distinct()
                    .ToList();
                var existing = await context.VendorOrders
                    .AsNoTracking()
                    .Where(o => o.Tenantid == tenantId && stampIds.Contains(o.OrderID))
                    .Select(o => o.OrderID)
                    .ToListAsync(cancellationToken);
                if (excludeOrderId.HasValue)
                    existing = existing.Where(id => id != excludeOrderId.Value).ToList();
                return stampIds.Count > 0 && stampIds.All(id => existing.Contains(id));
            }

            // Legacy: no stamps but header fully converted AND a live VO still exists
            if (convertible.All(d => !LineStillConverted(d)))
            {
                var hasLive = await HasLiveLinkedOrderAsync(
                    context, tenantId, quotationId, excludeOrderId, cancellationToken);
                return hasLive &&
                       (quotation.isconverted == 1 ||
                        string.Equals(quotation.Status, StatusConverted, StringComparison.OrdinalIgnoreCase));
            }

            return false;
        }

        /// <summary>
        /// True when any vendor quotation in the RFQ group has all of its own lines converted.
        /// </summary>
        public static async Task<bool> IsAnyVendorFullyConvertedAsync(
            CimmpleDbContext context,
            int tenantId,
            int masterQuotationId,
            int? excludeOrderId = null,
            CancellationToken cancellationToken = default)
        {
            var master = await context.VendorQuotations
                .AsNoTracking()
                .FirstOrDefaultAsync(q => q.OrderID == masterQuotationId && q.Tenantid == tenantId, cancellationToken);
            if (master == null) return false;

            var groupIds = await GetGroupQuotationIdsAsync(context, master, cancellationToken);
            foreach (var qid in groupIds)
            {
                if (await IsQuotationFullyConvertedAsync(context, tenantId, qid, excludeOrderId, cancellationToken))
                    return true;
            }
            return false;
        }

        /// <summary>
        /// Hide Compare when all master RFQ lines are covered (same or different vendors),
        /// or when any single vendor quote is fully converted.
        /// </summary>
        public static async Task<bool> ShouldHideCompareAsync(
            CimmpleDbContext context,
            int tenantId,
            int masterQuotationId,
            int? excludeOrderId = null,
            CancellationToken cancellationToken = default)
        {
            if (await AreAllMasterLinesCoveredAsync(
                    context, tenantId, masterQuotationId, excludeOrderId, cancellationToken))
                return true;
            return await IsAnyVendorFullyConvertedAsync(
                context, tenantId, masterQuotationId, excludeOrderId, cancellationToken);
        }

        /// <summary>Backward-compatible name — hide Compare when RFQ conversion is complete.</summary>
        public static Task<bool> IsGroupFullyConvertedAsync(
            CimmpleDbContext context,
            int tenantId,
            int masterQuotationId,
            CancellationToken cancellationToken = default) =>
            ShouldHideCompareAsync(context, tenantId, masterQuotationId, null, cancellationToken);

        private static async Task<bool> HasLiveLinkedOrderAsync(
            CimmpleDbContext context,
            int tenantId,
            int quotationId,
            int? excludeOrderId,
            CancellationToken cancellationToken)
        {
            var q = context.VendorOrders
                .AsNoTracking()
                .Where(o => o.Tenantid == tenantId && o.QuotationId == quotationId);
            if (excludeOrderId.HasValue && excludeOrderId.Value > 0)
                q = q.Where(o => o.OrderID != excludeOrderId.Value);
            return await q.AnyAsync(cancellationToken);
        }

        public static async Task<List<(int OrderId, int PoNumber)>> GetConvertedOrdersAsync(
            CimmpleDbContext context,
            int tenantId,
            IEnumerable<int> quotationIds,
            CancellationToken cancellationToken = default)
        {
            var qids = quotationIds?.Where(id => id > 0).Distinct().ToList() ?? new List<int>();
            if (qids.Count == 0) return new List<(int, int)>();

            var stampedOrderIds = await context.VendorQuotationsDetails
                .AsNoTracking()
                .Where(d => d.Tenantid == tenantId &&
                            qids.Contains(d.OrderID) &&
                            d.ConvertedVendorOrderId != null &&
                            d.ConvertedVendorOrderId > 0)
                .Select(d => d.ConvertedVendorOrderId!.Value)
                .Distinct()
                .ToListAsync(cancellationToken);

            var fromStamp = stampedOrderIds.Count == 0
                ? new List<(int OrderId, int PoNumber)>()
                : (await context.VendorOrders
                        .AsNoTracking()
                        .Where(o => o.Tenantid == tenantId && stampedOrderIds.Contains(o.OrderID))
                        .Select(o => new { o.OrderID, o.PONumber })
                        .ToListAsync(cancellationToken))
                    .Select(o => (OrderId: o.OrderID, PoNumber: o.PONumber))
                    .ToList();

            // Also include orders linked by QuotationId (union — multi-vendor split converts)
            var fromLink = (await context.VendorOrders
                    .AsNoTracking()
                    .Where(o => o.Tenantid == tenantId &&
                                o.QuotationId != null &&
                                qids.Contains(o.QuotationId.Value))
                    .Select(o => new { o.OrderID, o.PONumber })
                    .ToListAsync(cancellationToken))
                .Select(o => (OrderId: o.OrderID, PoNumber: o.PONumber))
                .ToList();

            return fromStamp
                .Concat(fromLink)
                .GroupBy(o => o.OrderId)
                .Select(g => g.First())
                .OrderBy(o => o.PoNumber)
                .ToList();
        }

        public static async Task<List<int>> GetGroupQuotationIdsAsync(
            CimmpleDbContext context,
            VendorQuotations quotation,
            CancellationToken cancellationToken = default)
        {
            var masterId = GetMasterId(quotation);
            var childIds = await context.VendorQuotations
                .AsNoTracking()
                .Where(q => q.Tenantid == quotation.Tenantid &&
                            q.ParentQuotationID == masterId &&
                            q.OrderID != masterId)
                .Select(q => q.OrderID)
                .ToListAsync(cancellationToken);

            var ids = new List<int> { masterId };
            ids.AddRange(childIds);
            return ids.Distinct().ToList();
        }

        public static int GetMasterId(VendorQuotations quotation)
        {
            if (quotation.ParentQuotationID.HasValue &&
                quotation.ParentQuotationID.Value > 0 &&
                quotation.ParentQuotationID.Value != quotation.OrderID)
                return quotation.ParentQuotationID.Value;
            return quotation.OrderID;
        }

        public static string ResolveStatusAfterUnconvert(VendorQuotations quotation)
        {
            var isChild = quotation.ParentQuotationID.HasValue
                && quotation.ParentQuotationID.Value > 0
                && quotation.ParentQuotationID.Value != quotation.OrderID;
            if (isChild)
                return "Responded";
            if (quotation.isSent)
                return "Sent";
            return "Draft";
        }

        private static async Task<int?> ResolveLatestPoNumberAsync(
            CimmpleDbContext context,
            int tenantId,
            List<int> vendorOrderIds,
            int? excludeOrderId,
            CancellationToken cancellationToken)
        {
            if (vendorOrderIds.Count == 0) return null;
            var q = context.VendorOrders
                .AsNoTracking()
                .Where(o => o.Tenantid == tenantId && vendorOrderIds.Contains(o.OrderID));
            if (excludeOrderId.HasValue && excludeOrderId.Value > 0)
                q = q.Where(o => o.OrderID != excludeOrderId.Value);
            var po = await q
                .OrderByDescending(o => o.OrderID)
                .Select(o => (int?)o.PONumber)
                .FirstOrDefaultAsync(cancellationToken);
            return po is > 0 ? po : null;
        }
    }
}
