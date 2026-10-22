using System.Globalization;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Services;

namespace CimmpleAPI.Services.Workflow
{
    /// <summary>
    /// Reads existing documents and returns a workflow projection. It does not insert,
    /// update, or copy balances into workflow tables.
    /// </summary>
    public sealed class WorkflowProjectionService
    {
        public const string Limitation =
            "Stages and counts are calculated from quotations, orders, jobs, inventory, shipments, non-conformance reports, and invoices. Amounts stay on the invoice. A workflow row, its tasks, and an event history are stored and refreshed when those records are saved. Assignment is not on this page yet.";

        private readonly CimmpleDbContext _context;

        public WorkflowProjectionService(CimmpleDbContext context)
        {
            _context = context;
        }

        public async Task<WorkflowOverviewDto> GetOverviewAsync(
            int tenantId,
            int? locationId,
            IReadOnlyList<int>? restrictToLocationIds,
            DateTime? today = null,
            int? onlyCustomerOrderId = null,
            int? onlyQuotationId = null)
        {
            var asOf = (today ?? DateTime.Now).Date;
            var orders = await LoadOrdersAsync(tenantId, locationId, restrictToLocationIds, onlyCustomerOrderId);
            var orderIds = orders.Select(o => o.OrderID).ToHashSet();
            var quotations = await LoadQuotationsAsync(tenantId, locationId, restrictToLocationIds, onlyQuotationId, onlyCustomerOrderId, orders);

            var orderIdList = orderIds.ToList();
            var details = orderIdList.Count == 0
                ? new List<CustomerOrderDetails>()
                : await _context.CustomerOrderDetails.AsNoTracking()
                    .Where(d => d.Tenantid == tenantId && orderIdList.Contains(d.OrderID))
                    .ToListAsync();
            var detailsByOrder = details
                .GroupBy(d => d.OrderID)
                .ToDictionary(g => g.Key, g => g.ToList());

            var jobs = orderIdList.Count == 0
                ? new List<JobOrderMaster>()
                : await _context.JobOrderMaster.AsNoTracking()
                    .Where(j => j.Tenantid == tenantId && orderIdList.Contains(j.CustomerOrderID))
                    .ToListAsync();
            var jobsByOrder = jobs.GroupBy(j => j.CustomerOrderID).ToDictionary(g => g.Key, g => g.ToList());
            var jobIds = jobs.Select(j => j.JobOrderID).ToHashSet();
            var jobIdList = jobIds.ToList();

            var requirements = jobIdList.Count == 0
                ? new List<JobMaterialRequirement>()
                : await _context.JobMaterialRequirement.AsNoTracking()
                    .Where(m => m.Tenantid == tenantId && jobIdList.Contains(m.JobOrderId))
                    .ToListAsync();

            var locationByOrder = orders.ToDictionary(o => o.OrderID, o => o.locationId);
            var shortages = await LoadShortagesAsync(tenantId, jobs, locationByOrder, requirements);
            var shortJobs = shortages.Where(s => s.ShortQty > 0).Select(s => s.JobOrderId).ToHashSet();

            // Project the columns we read. Several NCR text columns are non-nullable in
            // the model but null in older rows, and materializing the entity throws.
            var ncrQuery = _context.NonConformanceReports.AsNoTracking()
                .Where(n => n.TenantId == tenantId && n.JobOrderId != null);
            ncrQuery = jobIdList.Count == 0
                ? ncrQuery.Where(_ => false)
                : ncrQuery.Where(n => n.JobOrderId != null && jobIdList.Contains(n.JobOrderId.Value));
            var ncrs = await ncrQuery
                .Select(n => new NcrHit
                {
                    NcrId = n.NcrId,
                    JobOrderId = n.JobOrderId,
                    Number = n.NcrNumber ?? "",
                    Title = n.Title ?? "",
                    Status = n.Status ?? "",
                    Severity = n.Severity ?? "",
                    DueDate = n.DueDate,
                })
                .ToListAsync();
            ncrs = ncrs.Where(n => n.JobOrderId.HasValue && jobIds.Contains(n.JobOrderId.Value)).ToList();
            var ncrsByJob = ncrs.GroupBy(n => n.JobOrderId!.Value).ToDictionary(g => g.Key, g => g.ToList());

            var shipments = orderIdList.Count == 0
                ? new List<Shipping>()
                : await _context.Shipping.AsNoTracking()
                    .Where(s => s.TenantId == tenantId && orderIdList.Contains(s.OrderId))
                    .ToListAsync();
            var shipmentsByOrder = shipments.Where(s => orderIds.Contains(s.OrderId))
                .GroupBy(s => s.OrderId)
                .ToDictionary(g => g.Key, g => g.ToList());

            var invoiceRows = orderIdList.Count == 0
                ? new List<InvoiceHit>()
                : await (
                from d in _context.InvoiceDetail.AsNoTracking()
                join i in _context.InvoiceMaster.AsNoTracking() on d.InvoiceId equals i.Id
                where i.TenantId == tenantId && orderIdList.Contains(d.OrderId)
                select new InvoiceHit
                {
                    Id = i.Id,
                    OrderId = d.OrderId,
                    InvoiceNo = i.InvoiceNo,
                    PrefixInvoiceNo = i.PrefixInvoiceNo ?? "",
                    TotalAmount = i.TotalAmount,
                    PaidAmount = i.PaidAmount,
                    PaymentDate = i.PaymentDate,
                    DueDate = i.DueDate,
                    IsVoided = i.IsVoided,
                }).ToListAsync();
            var invoicesByOrder = invoiceRows
                .Where(r => orderIds.Contains(r.OrderId))
                .GroupBy(r => r.OrderId)
                .ToDictionary(
                    g => g.Key,
                    g => g.GroupBy(i => i.Id).Select(x => x.First()).ToList());

            var purchases = await LoadPurchasesAsync(tenantId, jobIds);
            var purchasesByJob = purchases.GroupBy(p => p.JobOrderId).ToDictionary(g => g.Key, g => g.ToList());

            var userIds = orders.Select(o => o.UserId)
                .Concat(quotations.Select(q => q.UserId))
                .Concat(jobs.Select(j => j.UserId))
                .Where(id => id > 0)
                .Distinct()
                .ToList();
            var users = await LoadUsersAsync(tenantId, userIds);

            var quotationById = quotations.ToDictionary(q => q.OrderID);
            var workflows = new List<WorkflowRowDto>();
            var actions = new List<WorkflowActionDto>();
            var collection = new List<WorkflowCollectionCardDto>();
            var seenInvoices = new HashSet<int>();

            foreach (var order in orders.OrderByDescending(o => o.OrderDate))
            {
                var lines = detailsByOrder.TryGetValue(order.OrderID, out var foundLines) ? foundLines : new List<CustomerOrderDetails>();
                var orderJobs = jobsByOrder.TryGetValue(order.OrderID, out var foundJobs) ? foundJobs : new List<JobOrderMaster>();
                var orderInvoices = invoicesByOrder.TryGetValue(order.OrderID, out var foundInvoices) ? foundInvoices : new List<InvoiceHit>();
                var orderNcrs = orderJobs.SelectMany(j => ncrsByJob.TryGetValue(j.JobOrderID, out var list) ? list : Enumerable.Empty<NcrHit>()).ToList();
                var orderShortages = shortages.Where(s => orderJobs.Any(j => j.JobOrderID == s.JobOrderId) && s.ShortQty > 0).ToList();
                var orderShipments = shipmentsByOrder.TryGetValue(order.OrderID, out var foundShipments) ? foundShipments : new List<Shipping>();
                var orderPurchases = orderJobs
                    .SelectMany(j => purchasesByJob.TryGetValue(j.JobOrderID, out var list) ? list : Enumerable.Empty<PurchaseHit>())
                    .GroupBy(p => p.VendorOrderId)
                    .Select(g => g.First())
                    .ToList();

                QuotationOrder? quotation = null;
                if (order.quotationId.HasValue)
                    quotationById.TryGetValue(order.quotationId.Value, out quotation);

                var invoiceFacts = orderInvoices.Select(ToInvoiceFacts).ToList();
                var evaluation = WorkflowStageRules.Evaluate(new WorkflowFacts
                {
                    HasCustomerOrder = true,
                    OrderStatus = order.Status,
                    HasQuotation = quotation != null || order.quotationId.HasValue,
                    QuotationStatus = quotation?.Status,
                    Lines = lines.Select(line => new WorkflowLineFacts
                    {
                        QtyOrdered = line.QtyOrdered,
                        ShippedQty = line.ShippedQty,
                        InvoicedQty = line.InvoicedQty,
                        DueDate = RealDate(line.DueDate),
                        HasJob = orderJobs.Any(j => j.CustomerOrderDetailID == line.ID),
                    }).ToList(),
                    Jobs = orderJobs.Select(job => new WorkflowJobFacts
                    {
                        Status = job.Status,
                        DueDate = RealDate(job.DueDate),
                        HasMaterialRequirements = requirements.Any(r => r.JobOrderId == job.JobOrderID),
                        MaterialShort = shortJobs.Contains(job.JobOrderID),
                    }).ToList(),
                    Invoices = invoiceFacts,
                    Ncrs = orderNcrs.Select(n => new WorkflowNcrFacts { Status = n.Status }).ToList(),
                    Today = asOf,
                });

                var invoiceLinks = new List<WorkflowInvoiceLinkDto>();
                for (var i = 0; i < orderInvoices.Count; i++)
                    invoiceLinks.Add(ToInvoiceLink(orderInvoices[i], evaluation.Invoices[i]));

                var jobLinks = orderJobs.Select(ToJobLink).ToList();
                var row = new WorkflowRowDto
                {
                    Id = "order-" + order.OrderID,
                    Kind = "Order",
                    CustomerName = order.CustomerName ?? "",
                    Reference = Doc("CO#", order.PONumber > 0 ? order.PONumber : order.OrderID),
                    CustomerPo = NullIfBlank(order.CustomerPoNumber),
                    PrincipalStage = evaluation.PrincipalStage,
                    PrincipalStageLabel = WorkflowStageRules.StageLabel(evaluation.PrincipalStage),
                    Indicator = evaluation.Indicator,
                    IsActive = evaluation.IsActive,
                    IsBlocked = evaluation.IsBlocked,
                    IsOverdue = evaluation.IsOverdue,
                    NeedsAction = evaluation.NeedsAction,
                    IsComplete = evaluation.IsComplete,
                    IsCancelled = evaluation.IsCancelled,
                    CreatedByName = UserName(users, order.UserId),
                    DocumentDate = DateText(RealDate(order.OrderDate)),
                    DueDate = DateText(EarliestDue(lines, orderJobs, invoiceLinks)),
                    AgeDays = Age(RealDate(order.OrderDate), asOf),
                    BlockerReason = evaluation.BlockerReason,
                    NextAction = evaluation.NextAction,
                    QuotationPath = order.quotationId is > 0 ? "/quotations/customer?open=" + order.quotationId : null,
                    OrderPath = "/orders/customer?open=" + order.OrderID,
                    Stages = evaluation.Stages.Select(ToStage).ToList(),
                    Jobs = jobLinks,
                    Shipments = orderShipments.Select(ToShipment).ToList(),
                    Invoices = invoiceLinks,
                    Ncrs = orderNcrs.Select(ToNcr).ToList(),
                    Purchases = orderPurchases.Select(ToPurchase).ToList(),
                    Shortages = orderShortages,
                    CustomerOrderId = order.OrderID,
                    QuotationId = order.quotationId is > 0 ? order.quotationId : null,
                };
                row.SearchText = SearchBlob(row);
                workflows.Add(row);
                AddOrderActions(actions, row, evaluation, lines, orderJobs, orderNcrs, orderShortages, asOf, order.OrderID);

                if (evaluation.HasUninvoicedShipment)
                    collection.Add(ReadyCard(row));

                foreach (var link in invoiceLinks)
                {
                    if (!seenInvoices.Add(link.InvoiceId))
                        continue;
                    collection.Add(InvoiceCard(row, link));
                }
            }

            var linkedQuotationIds = orders
                .Where(o => o.quotationId is > 0)
                .Select(o => o.quotationId!.Value)
                .ToHashSet();
            foreach (var quotation in quotations.OrderByDescending(q => q.OrderDate))
            {
                if (quotation.convertedOrderId is > 0 || linkedQuotationIds.Contains(quotation.OrderID))
                    continue;
                var marked = IsConvertedQuotation(quotation);

                var evaluation = WorkflowStageRules.Evaluate(new WorkflowFacts
                {
                    QuotationStatus = quotation.Status,
                    QuotationMarkedConverted = marked,
                    HasQuotation = true,
                    Today = asOf,
                });
                var row = new WorkflowRowDto
                {
                    Id = "quotation-" + quotation.OrderID,
                    Kind = "Quotation",
                    CustomerName = quotation.CustomerName ?? "",
                    Reference = Doc("CQ#", quotation.PONumber > 0 ? quotation.PONumber : quotation.OrderID),
                    CustomerPo = NullIfBlank(quotation.CustomerPoNumber),
                    PrincipalStage = evaluation.PrincipalStage,
                    PrincipalStageLabel = WorkflowStageRules.StageLabel(evaluation.PrincipalStage),
                    Indicator = evaluation.Indicator,
                    IsActive = evaluation.IsActive,
                    IsBlocked = evaluation.IsBlocked,
                    IsOverdue = evaluation.IsOverdue,
                    NeedsAction = evaluation.NeedsAction,
                    IsComplete = evaluation.IsComplete,
                    IsCancelled = evaluation.IsCancelled,
                    CreatedByName = UserName(users, quotation.UserId),
                    DocumentDate = DateText(RealDate(quotation.OrderDate)),
                    DueDate = null,
                    AgeDays = Age(RealDate(quotation.OrderDate), asOf),
                    BlockerReason = evaluation.BlockerReason,
                    NextAction = evaluation.NextAction,
                    QuotationPath = "/quotations/customer?open=" + quotation.OrderID,
                    Stages = evaluation.Stages.Select(ToStage).ToList(),
                    QuotationId = quotation.OrderID,
                };
                row.SearchText = SearchBlob(row);
                workflows.Add(row);
                if (evaluation.IsActive)
                {
                    actions.Add(MakeAction(
                        "quotation-" + quotation.OrderID,
                        row,
                        "Quotation",
                        "Follow up " + row.Reference,
                        quotation.CustomerRefNo,
                        WorkflowStageRules.Quotation,
                        null,
                        row.QuotationPath,
                        "Open quotation",
                        sourceType: WorkflowCoordination.SourceQuotation,
                        sourceId: quotation.OrderID));
                }
            }

            actions = actions
                .OrderBy(a => a.Rank)
                .ThenByDescending(a => a.AgeDays)
                .ThenBy(a => a.CustomerName)
                .ToList();
            collection = collection
                .OrderBy(c => c.Rank)
                .ThenByDescending(c => c.Outstanding ?? 0)
                .ThenByDescending(c => c.AgeDays)
                .ToList();
            workflows = workflows
                .OrderBy(w => IndicatorRank(w.Indicator))
                .ThenByDescending(w => w.AgeDays)
                .ThenBy(w => w.CustomerName)
                .ToList();

            return new WorkflowOverviewDto
            {
                GeneratedAt = asOf.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                Limitation = Limitation,
                Summary = new WorkflowSummaryDto
                {
                    Active = workflows.Count(w => w.IsActive),
                    NeedsAction = workflows.Count(w => w.NeedsAction),
                    Blocked = workflows.Count(w => w.IsBlocked),
                    Overdue = workflows.Count(w => w.IsOverdue),
                },
                Stages = CountStages(workflows),
                Workflows = workflows,
                Actions = actions,
                Collection = collection,
            };
        }

        private async Task<List<CustomerOrder>> LoadOrdersAsync(
            int tenantId,
            int? locationId,
            IReadOnlyList<int>? restrict,
            int? onlyCustomerOrderId)
        {
            var query = _context.CustomerOrder.AsNoTracking().Where(o => o.Tenantid == tenantId);
            if (onlyCustomerOrderId is > 0)
                query = query.Where(o => o.OrderID == onlyCustomerOrderId.Value);
            else if (locationId.HasValue)
                query = query.Where(o => o.locationId == locationId.Value);
            else if (restrict != null)
            {
                var ids = restrict.ToList();
                query = ids.Count == 0
                    ? query.Where(_ => false)
                    : query.Where(o => ids.Contains(o.locationId));
            }

            return await query.ToListAsync();
        }

        private async Task<List<QuotationOrder>> LoadQuotationsAsync(
            int tenantId,
            int? locationId,
            IReadOnlyList<int>? restrict,
            int? onlyQuotationId,
            int? onlyCustomerOrderId,
            List<CustomerOrder> orders)
        {
            var query = _context.QuotationOrder.AsNoTracking().Where(q => q.Tenantid == tenantId);
            if (onlyQuotationId is > 0)
                query = query.Where(q => q.OrderID == onlyQuotationId.Value);
            else if (onlyCustomerOrderId is > 0)
            {
                var scopedOrderId = onlyCustomerOrderId.Value;
                var quotationId = orders.Where(o => o.quotationId is > 0).Select(o => o.quotationId!.Value).FirstOrDefault();
                query = query.Where(q => q.convertedOrderId == scopedOrderId || (quotationId > 0 && q.OrderID == quotationId));
            }
            else if (locationId.HasValue)
                query = query.Where(q => q.Locationid == locationId.Value);
            else if (restrict != null)
            {
                var ids = restrict.ToList();
                query = ids.Count == 0
                    ? query.Where(_ => false)
                    : query.Where(q => q.Locationid.HasValue && ids.Contains(q.Locationid.Value));
            }

            return await query.ToListAsync();
        }

        private async Task<Dictionary<int, string>> LoadUsersAsync(int tenantId, List<int> userIds)
        {
            if (userIds.Count == 0)
                return new Dictionary<int, string>();

            var rows = await _context.UserDetails.AsNoTracking()
                .Where(u => u.TenantID == tenantId && userIds.Contains(u.User_UniqueID))
                .Select(u => new { u.User_UniqueID, u.FirstName, u.LastName })
                .ToListAsync();
            return rows.ToDictionary(
                u => u.User_UniqueID,
                u => string.Join(" ", new[] { u.FirstName, u.LastName }.Where(p => !string.IsNullOrWhiteSpace(p))).Trim());
        }

        private async Task<List<WorkflowShortageDto>> LoadShortagesAsync(
            int tenantId,
            List<JobOrderMaster> jobs,
            Dictionary<int, int> locationByOrder,
            List<JobMaterialRequirement> requirements)
        {
            var active = jobs.Where(j => !WorkflowStageRules.JobIgnoresMaterialShortage(j.Status)).ToList();
            if (active.Count == 0 || requirements.Count == 0)
                return new List<WorkflowShortageDto>();

            var activeIds = active.Select(j => j.JobOrderID).ToHashSet();
            var reqs = requirements.Where(r => activeIds.Contains(r.JobOrderId) && r.QuantityNeeded > 0).ToList();
            if (reqs.Count == 0)
                return new List<WorkflowShortageDto>();

            var productIds = reqs.Where(r => r.ProductId.HasValue).Select(r => r.ProductId!.Value).Distinct().ToList();
            var rawIds = reqs.Where(r => r.RawMaterialId.HasValue).Select(r => r.RawMaterialId!.Value).Distinct().ToList();
            var remnants = rawIds.Count == 0
                ? new Dictionary<int, List<int>>()
                : (await _context.RawMaterialMaster.AsNoTracking()
                    .Where(r => r.Tenantid == tenantId
                        && r.IsRemnant
                        && r.ParentRawMaterialId.HasValue
                        && rawIds.Contains(r.ParentRawMaterialId.Value))
                    .Select(r => new { r.Id, ParentId = r.ParentRawMaterialId!.Value })
                    .ToListAsync())
                    .GroupBy(r => r.ParentId)
                    .ToDictionary(g => g.Key, g => g.Select(x => x.Id).ToList());
            var familyRawIds = rawIds.Concat(remnants.SelectMany(kv => kv.Value)).Distinct().ToList();

            var balances = productIds.Count == 0 && familyRawIds.Count == 0
                ? new List<InventoryBalance>()
                : await _context.InventoryBalance.AsNoTracking()
                    .Where(b => b.Tenantid == tenantId
                        && (
                            (b.ProductId.HasValue && productIds.Contains(b.ProductId.Value))
                            || (b.RawMaterialId.HasValue && familyRawIds.Contains(b.RawMaterialId.Value))
                        ))
                    .ToListAsync();

            var reservations = await _context.InventoryReservation.AsNoTracking()
                .Where(r => r.Tenantid == tenantId
                    && r.ReferenceType == "JobOrder"
                    && activeIds.Contains(r.ReferenceId)
                    && r.Quantity > 0)
                .ToListAsync();
            var issues = await _context.InventoryTransaction.AsNoTracking()
                .Where(t => t.Tenantid == tenantId
                    && t.ReferenceType == "JobOrder"
                    && t.ReferenceId.HasValue
                    && activeIds.Contains(t.ReferenceId.Value)
                    && t.TransactionTypeId == 2)
                .ToListAsync();

            var productNames = productIds.Count == 0
                ? new Dictionary<int, (string? No, string? Name)>()
                : (await _context.ProductMaster.AsNoTracking()
                    .Where(p => productIds.Contains(p.Id))
                    .Select(p => new { p.Id, p.partno, p.partname })
                    .ToListAsync())
                    .ToDictionary(p => p.Id, p => (p.partno, p.partname));
            var rawNames = rawIds.Count == 0
                ? new Dictionary<int, (string? No, string? Name)>()
                : (await _context.RawMaterialMaster.AsNoTracking()
                    .Where(r => rawIds.Contains(r.Id))
                    .Select(r => new { r.Id, r.PartNo, r.PartName })
                    .ToListAsync())
                    .ToDictionary(r => r.Id, r => (r.PartNo, r.PartName));

            var jobById = active.ToDictionary(j => j.JobOrderID);
            var hits = new List<WorkflowShortageDto>();
            foreach (var line in reqs)
            {
                if (!jobById.TryGetValue(line.JobOrderId, out var job))
                    continue;
                var loc = locationByOrder.TryGetValue(job.CustomerOrderID, out var orderLoc) ? orderLoc : 0;
                var family = Family(line.RawMaterialId, remnants);
                var useProduct = line.ProductId.HasValue;
                var available = balances
                    .Where(b => (loc <= 0 || b.LocationId == loc)
                        && (useProduct
                            ? b.ProductId == line.ProductId
                            : b.RawMaterialId.HasValue && family.Contains(b.RawMaterialId.Value)))
                    .Sum(b => b.QuantityOnHand - b.QuantityReserved);
                var reserved = reservations
                    .Where(r => r.ReferenceId == job.JobOrderID
                        && (useProduct
                            ? r.ProductId == line.ProductId
                            : r.RawMaterialId.HasValue && family.Contains(r.RawMaterialId.Value)))
                    .Sum(r => r.Quantity);
                var issued = issues
                    .Where(t => t.ReferenceId == job.JobOrderID
                        && (useProduct
                            ? t.ProductId == line.ProductId
                            : t.RawMaterialId.HasValue && family.Contains(t.RawMaterialId.Value)))
                    .Sum(t => Math.Abs(t.Quantity));
                var shortQty = WorkflowStageRules.MaterialShortageQty(line.QuantityNeeded, reserved, issued, available);
                if (shortQty <= 0)
                    continue;

                string? partNo = null;
                string? partName = null;
                if (useProduct && line.ProductId.HasValue && productNames.TryGetValue(line.ProductId.Value, out var product))
                {
                    partNo = product.Item1;
                    partName = product.Item2;
                }
                else if (line.RawMaterialId.HasValue && rawNames.TryGetValue(line.RawMaterialId.Value, out var raw))
                {
                    partNo = raw.Item1;
                    partName = raw.Item2;
                }

                hits.Add(new WorkflowShortageDto
                {
                    JobOrderId = job.JobOrderID,
                    JobNumber = Doc("JO#", job.JobOrderNumber > 0 ? job.JobOrderNumber : job.JobOrderID),
                    PartNo = partNo,
                    PartName = partName,
                    Needed = line.QuantityNeeded,
                    Available = available,
                    Reserved = reserved,
                    Issued = issued,
                    ShortQty = shortQty,
                    RequiredBy = DateText(RealDate(job.DueDate)),
                });
            }

            return hits;
        }

        private async Task<List<PurchaseHit>> LoadPurchasesAsync(int tenantId, HashSet<int> jobIds)
        {
            if (jobIds.Count == 0)
                return new List<PurchaseHit>();

            var jobIdList = jobIds.ToList();
            var lines = await (
                from d in _context.VendorOrderDetails.AsNoTracking()
                join v in _context.VendorOrders.AsNoTracking() on d.OrderID equals v.OrderID
                where v.Tenantid == tenantId && jobIdList.Contains(d.JobId)
                select new
                {
                    d.ID,
                    d.OrderID,
                    d.JobId,
                    d.QtyOrdered,
                    v.PONumber,
                    Status = v.Status ?? "",
                    VendorName = v.VendorName ?? "",
                }).ToListAsync();
            lines = lines.Where(l => jobIds.Contains(l.JobId)).ToList();
            if (lines.Count == 0)
                return new List<PurchaseHit>();

            var detailIds = lines.Select(l => l.ID).ToList();
            var receipts = await _context.VendorReceiving.AsNoTracking()
                .Where(r => r.Tenantid == tenantId && detailIds.Contains(r.VendorOrderDetailID))
                .Select(r => new { r.VendorOrderDetailID, r.ReceivedQty })
                .ToListAsync();
            var receivedByDetail = receipts
                .GroupBy(r => r.VendorOrderDetailID)
                .ToDictionary(g => g.Key, g => g.Sum(x => x.ReceivedQty));

            return lines
                .GroupBy(l => new { l.OrderID, l.JobId })
                .Select(g => new PurchaseHit
                {
                    VendorOrderId = g.Key.OrderID,
                    JobOrderId = g.Key.JobId,
                    Number = Doc("VO#", g.First().PONumber > 0 ? g.First().PONumber : g.Key.OrderID),
                    VendorName = g.First().VendorName,
                    Status = g.First().Status,
                    QtyOrdered = g.Sum(x => x.QtyOrdered),
                    QtyReceived = g.Sum(x => receivedByDetail.TryGetValue(x.ID, out var qty) ? qty : 0),
                })
                .ToList();
        }

        private static void AddOrderActions(
            List<WorkflowActionDto> actions,
            WorkflowRowDto row,
            WorkflowEvaluation evaluation,
            List<CustomerOrderDetails> lines,
            List<JobOrderMaster> jobs,
            List<NcrHit> ncrs,
            List<WorkflowShortageDto> shortages,
            DateTime today,
            int customerOrderId)
        {
            if (!evaluation.IsActive)
                return;

            foreach (var shortage in shortages)
            {
                var part = string.Join(" ", new[] { shortage.PartNo, shortage.PartName }.Where(s => !string.IsNullOrWhiteSpace(s)));
                actions.Add(MakeAction(
                    "short-" + row.Id + "-" + shortage.JobOrderId + "-" + (shortage.PartNo ?? shortage.PartName ?? "part"),
                    row,
                    "MaterialShortage",
                    "Material shortage on " + shortage.JobNumber,
                    string.IsNullOrWhiteSpace(part)
                        ? null
                        : part + " needs " + Qty(shortage.Needed) + ", available " + Qty(shortage.Available) + ", short " + Qty(shortage.ShortQty) + ".",
                    WorkflowStageRules.Materials,
                    shortage.RequiredBy,
                    "/job-orders?open=" + shortage.JobOrderId,
                    "Open job order",
                    linkText: shortage.JobNumber,
                    sourceType: WorkflowCoordination.SourceJob,
                    sourceId: shortage.JobOrderId));
            }

            foreach (var invoice in row.Invoices.Where(i => i.Status != "Paid" && i.Status != "Void"))
            {
                var overdue = invoice.DaysOverdue.HasValue;
                actions.Add(MakeAction(
                    (overdue ? "overdue-invoice-" : "balance-") + invoice.InvoiceId,
                    row,
                    overdue ? "OverdueInvoice" : "OpenBalance",
                    (overdue ? "Overdue invoice " : "Collect ") + invoice.Number,
                    "Outstanding " + invoice.Balance.ToString("0.00", CultureInfo.InvariantCulture) + ".",
                    WorkflowStageRules.Collection,
                    invoice.DueDate,
                    invoice.Path,
                    "Open invoice",
                    linkText: invoice.Number,
                    sourceType: WorkflowCoordination.SourceInvoice,
                    sourceId: invoice.InvoiceId));
            }

            foreach (var job in jobs.Where(j => !WorkflowStageRules.JobIgnoresMaterialShortage(j.Status)))
            {
                var due = RealDate(job.DueDate);
                if (!due.HasValue || due.Value.Date >= today || shortages.Any(s => s.JobOrderId == job.JobOrderID))
                    continue;
                var number = Doc("JO#", job.JobOrderNumber > 0 ? job.JobOrderNumber : job.JobOrderID);
                actions.Add(MakeAction(
                    "overdue-job-" + job.JobOrderID,
                    row,
                    "OverdueJob",
                    "Overdue job " + number,
                    job.PartNo,
                    WorkflowStageRules.Production,
                    DateText(due),
                    "/job-orders?open=" + job.JobOrderID,
                    "Open job order",
                    linkText: number,
                    sourceType: WorkflowCoordination.SourceJob,
                    sourceId: job.JobOrderID));
            }

            foreach (var ncr in ncrs.Where(n => !Eq(n.Status, "Closed") && !Eq(n.Status, "Rejected")))
            {
                actions.Add(MakeAction(
                    "ncr-" + ncr.NcrId,
                    row,
                    "OpenNcr",
                    "Open NCR " + ncr.Number,
                    ncr.Title,
                    WorkflowStageRules.Quality,
                    DateText(RealDate(ncr.DueDate)),
                    "/quality?open=" + ncr.NcrId,
                    "Open NCR",
                    Eq(ncr.Severity, "Critical") || Eq(ncr.Severity, "Major") ? "High" : null,
                    string.IsNullOrWhiteSpace(ncr.Number) ? "NCR " + ncr.NcrId : ncr.Number,
                    WorkflowCoordination.SourceNcr,
                    ncr.NcrId));
            }

            if (evaluation.HasUninvoicedShipment)
            {
                actions.Add(MakeAction(
                    "invoice-" + row.Id,
                    row,
                    "UninvoicedShipment",
                    "Invoice shipped quantity on " + row.Reference,
                    null,
                    WorkflowStageRules.Invoice,
                    row.DueDate,
                    row.OrderPath,
                    "Open customer order",
                    sourceType: WorkflowCoordination.SourceCustomerOrder,
                    sourceId: customerOrderId));
            }

            if (evaluation.ShipmentReady)
            {
                actions.Add(MakeAction(
                    "ship-" + row.Id,
                    row,
                    "ReadyToShip",
                    "Ship " + row.Reference,
                    null,
                    WorkflowStageRules.Shipment,
                    row.DueDate,
                    row.OrderPath,
                    "Open customer order",
                    sourceType: WorkflowCoordination.SourceCustomerOrder,
                    sourceId: customerOrderId));
            }

            if (evaluation.PlanningGap)
            {
                var missing = lines.Where(l => !jobs.Any(j => j.CustomerOrderDetailID == l.ID)).ToList();
                if (missing.Count == 0)
                    missing = lines.Take(1).ToList();
                foreach (var line in missing)
                {
                    actions.Add(MakeAction(
                        "plan-" + row.Id + "-" + line.ID,
                        row,
                        "PlanningGap",
                        "Create a job for " + (string.IsNullOrWhiteSpace(line.PartNo) ? row.Reference : line.PartNo),
                        line.partname,
                        WorkflowStageRules.Planning,
                        DateText(RealDate(line.DueDate)),
                        row.OrderPath,
                        "Open customer order",
                        sourceType: WorkflowCoordination.SourceOrderDetail,
                        sourceId: line.ID));
                }
            }

            if (evaluation.NarrowDraft)
            {
                actions.Add(MakeAction(
                    "draft-" + row.Id,
                    row,
                    "DraftOrder",
                    "Confirm " + row.Reference,
                    null,
                    WorkflowStageRules.CustomerOrder,
                    row.DueDate,
                    row.OrderPath,
                    "Open customer order",
                    sourceType: WorkflowCoordination.SourceCustomerOrder,
                    sourceId: customerOrderId));
            }
        }

        private static WorkflowActionDto MakeAction(
            string id,
            WorkflowRowDto row,
            string kind,
            string title,
            string? detail,
            string stage,
            string? due,
            string? path,
            string linkLabel,
            string? priorityOverride = null,
            string? linkText = null,
            string? sourceType = null,
            int sourceId = 0)
        {
            var rank = WorkflowStageRules.AttentionRank(kind);
            var priority = priorityOverride ?? (rank == 0 ? "Blocked" : rank <= 2 ? "Overdue" : "Normal");
            return new WorkflowActionDto
            {
                Id = id,
                WorkflowId = row.Id,
                Kind = kind,
                Rank = rank,
                PriorityLabel = priority,
                Title = title,
                Detail = detail,
                CustomerName = row.CustomerName,
                Reference = row.Reference,
                OrderPath = row.OrderPath,
                LinkText = string.IsNullOrWhiteSpace(linkText) ? row.Reference : linkText,
                StageCode = stage,
                StageLabel = WorkflowStageRules.StageLabel(stage),
                DueDate = due,
                AgeDays = row.AgeDays,
                BlockerReason = kind == "MaterialShortage" ? row.BlockerReason : null,
                NextAction = kind == "MaterialShortage"
                    ? WorkflowStageRules.NextAction(stage, false, false, true, false, false)
                    : WorkflowStageRules.NextAction(stage, false, false, false, kind == "OverdueInvoice" || kind == "OverdueJob", false),
                LinkPath = path,
                LinkLabel = linkLabel,
                SourceType = sourceType,
                SourceId = sourceId,
            };
        }

        private static WorkflowCollectionCardDto ReadyCard(WorkflowRowDto row) => new()
        {
            Id = "ready-" + row.Id,
            WorkflowId = row.Id,
            Lane = "invoicing",
            Substage = "Ready for invoicing",
            Rank = 1,
            CustomerName = row.CustomerName,
            OrderNumber = row.Reference,
            OrderPath = row.OrderPath,
            JobNumbers = row.Jobs.Select(j => j.Number).Where(n => n.Length > 0).ToList(),
            OwnerLabel = "Unassigned",
            AgeDays = row.AgeDays,
            DueDate = row.DueDate,
            BlockerReason = row.BlockerReason,
            NextAction = "Create the invoice for the shipped quantity.",
            IsOverdue = row.IsOverdue,
            IsBlocked = row.IsBlocked,
            SearchText = row.SearchText,
        };

        private static WorkflowCollectionCardDto InvoiceCard(WorkflowRowDto row, WorkflowInvoiceLinkDto invoice)
        {
            var rank = invoice.Substage switch
            {
                "Overdue" => 0,
                "Partially paid" => 2,
                "Awaiting payment" => 3,
                "Paid" => 4,
                "Void" => 5,
                _ => 3,
            };
            return new WorkflowCollectionCardDto
            {
                Id = "invoice-" + invoice.InvoiceId,
                WorkflowId = row.Id,
                Lane = "collection",
                Substage = invoice.Substage,
                Rank = rank,
                CustomerName = row.CustomerName,
                OrderNumber = row.Reference,
                OrderPath = row.OrderPath,
                JobNumbers = row.Jobs.Select(j => j.Number).Where(n => n.Length > 0).ToList(),
                InvoiceNumber = invoice.Number,
                InvoicePath = invoice.Path,
                OwnerLabel = "Unassigned",
                AgeDays = row.AgeDays,
                InvoiceAmount = invoice.TotalAmount,
                PaidAmount = invoice.PaidAmount,
                Outstanding = invoice.Balance,
                DueDate = invoice.DueDate,
                BlockerReason = row.IsBlocked ? row.BlockerReason : null,
                NextAction = invoice.Substage switch
                {
                    "Paid" => "No collection action. The invoice is paid.",
                    "Void" => "Invoice is void. The invoice record keeps the history.",
                    "Overdue" => "Follow up the overdue balance in Accounts Receivable.",
                    _ => "Collect the outstanding balance in Accounts Receivable.",
                },
                IsOverdue = invoice.DaysOverdue.HasValue,
                IsBlocked = row.IsBlocked,
                SearchText = (row.SearchText + " " + invoice.Number + " " + invoice.Substage).Trim(),
            };
        }

        private static List<WorkflowStageCountDto> CountStages(List<WorkflowRowDto> workflows)
        {
            return WorkflowStageRules.StageCatalog.Select(stage =>
            {
                var rows = workflows.Where(w => w.PrincipalStage == stage.Code).ToList();
                var active = rows.Where(w => w.IsActive).ToList();
                return new WorkflowStageCountDto
                {
                    Code = stage.Code,
                    Label = stage.Label,
                    ActiveCount = active.Count,
                    BlockedCount = rows.Count(w => w.IsBlocked),
                    OverdueCount = rows.Count(w => w.IsOverdue),
                    OldestAgeDays = active.Count == 0 ? null : active.Max(w => w.AgeDays),
                };
            }).ToList();
        }

        private static WorkflowInvoiceFacts ToInvoiceFacts(InvoiceHit invoice) => new()
        {
            IsVoided = invoice.IsVoided,
            TotalAmount = invoice.TotalAmount,
            PaidAmount = invoice.PaidAmount,
            PaymentDate = invoice.PaymentDate,
            DueDate = invoice.DueDate,
        };

        private static WorkflowInvoiceLinkDto ToInvoiceLink(InvoiceHit invoice, WorkflowInvoiceEvaluation eval) => new()
        {
            InvoiceId = invoice.Id,
            Number = string.IsNullOrWhiteSpace(invoice.PrefixInvoiceNo) ? invoice.InvoiceNo.ToString(CultureInfo.InvariantCulture) : invoice.PrefixInvoiceNo,
            Status = eval.Status,
            Substage = eval.Substage,
            TotalAmount = invoice.TotalAmount,
            PaidAmount = eval.Paid,
            Balance = eval.Balance,
            DueDate = DateText(RealDate(invoice.DueDate)),
            DaysOverdue = eval.DaysOverdue,
            Path = "/orders/customer-invoices?open=" + invoice.Id,
        };

        private static WorkflowJobLinkDto ToJobLink(JobOrderMaster job) => new()
        {
            JobOrderId = job.JobOrderID,
            Number = Doc("JO#", job.JobOrderNumber > 0 ? job.JobOrderNumber : job.JobOrderID),
            PartNo = job.PartNo,
            PartName = job.PartName,
            Status = job.Status,
            DueDate = DateText(RealDate(job.DueDate)),
            Path = "/job-orders?open=" + job.JobOrderID,
        };

        private static WorkflowShipmentLinkDto ToShipment(Shipping shipment) => new()
        {
            ShipmentId = shipment.Id,
            Number = string.IsNullOrWhiteSpace(shipment.ShipmentNo) ? "Shipment " + shipment.Id : shipment.ShipmentNo,
            ShipmentDate = DateText(RealDate(shipment.ShipmentDate)),
            Path = "/orders/customer-shipments?open=" + shipment.Id,
        };

        private static WorkflowNcrLinkDto ToNcr(NcrHit ncr) => new()
        {
            NcrId = ncr.NcrId,
            Number = ncr.Number,
            Title = ncr.Title,
            Status = ncr.Status,
            Severity = ncr.Severity,
            Path = "/quality?open=" + ncr.NcrId,
        };

        private static WorkflowPurchaseLinkDto ToPurchase(PurchaseHit hit) => new()
        {
            VendorOrderId = hit.VendorOrderId,
            Number = hit.Number,
            VendorName = hit.VendorName,
            Status = hit.Status,
            QtyOrdered = hit.QtyOrdered,
            QtyReceived = hit.QtyReceived,
            OrderPath = "/purchasing/vendor-orders?open=" + hit.VendorOrderId,
            ReceivingPath = "/purchasing/vendor-receiving?open=" + hit.VendorOrderId,
        };

        private static WorkflowStageStateDto ToStage(WorkflowStageEvaluation stage) => new()
        {
            Code = stage.Code,
            Label = stage.Label,
            State = stage.State,
        };

        private static DateTime? EarliestDue(
            List<CustomerOrderDetails> lines,
            List<JobOrderMaster> jobs,
            List<WorkflowInvoiceLinkDto> invoices)
        {
            var dates = lines.Where(l => l.QtyOrdered > l.ShippedQty).Select(l => RealDate(l.DueDate))
                .Concat(jobs.Where(j => !WorkflowStageRules.JobIgnoresMaterialShortage(j.Status)).Select(j => RealDate(j.DueDate)))
                .Concat(invoices.Where(i => i.Status != "Paid" && i.Status != "Void").Select(i => ParseDate(i.DueDate)));
            var real = dates.Where(d => d.HasValue).Select(d => d!.Value).ToList();
            return real.Count == 0 ? null : real.Min();
        }

        private static string SearchBlob(WorkflowRowDto row)
        {
            var parts = new List<string?>
            {
                row.CustomerName,
                row.Reference,
                row.CustomerPo,
                row.PrincipalStageLabel,
                row.Indicator,
                row.CreatedByName,
            };
            parts.AddRange(row.Jobs.SelectMany(j => new[] { j.Number, j.PartNo, j.PartName }));
            parts.AddRange(row.Invoices.Select(i => i.Number));
            parts.AddRange(row.Shipments.Select(s => s.Number));
            parts.AddRange(row.Ncrs.Select(n => n.Number));
            parts.AddRange(row.Purchases.Select(p => p.Number));
            parts.AddRange(row.Shortages.SelectMany(s => new[] { s.PartNo, s.PartName, s.JobNumber }));
            return string.Join(" ", parts.Where(p => !string.IsNullOrWhiteSpace(p)));
        }

        private static HashSet<int> Family(int? rawId, Dictionary<int, List<int>> remnants)
        {
            var ids = new HashSet<int>();
            if (!rawId.HasValue)
                return ids;
            ids.Add(rawId.Value);
            if (remnants.TryGetValue(rawId.Value, out var kids))
            {
                foreach (var id in kids)
                    ids.Add(id);
            }
            return ids;
        }

        private static bool IsConvertedQuotation(QuotationOrder quotation) =>
            Eq(quotation.Status, "Converted") || quotation.isConverted == 1 || quotation.convertedOrderId is > 0;

        private static string Doc(string prefix, int raw) =>
            raw <= 0 ? "" : prefix + GlobalSearchSupport.ToDisplayDocNumber(raw);

        private static string? UserName(Dictionary<int, string> users, int userId)
        {
            if (userId <= 0)
                return null;
            return users.TryGetValue(userId, out var name) && !string.IsNullOrWhiteSpace(name) ? name : null;
        }

        private static DateTime? RealDate(DateTime value) => value.Year < 1900 ? null : value;
        private static DateTime? RealDate(DateTime? value) => value.HasValue ? RealDate(value.Value) : null;

        private static string? DateText(DateTime? value) =>
            value.HasValue ? value.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : null;

        private static DateTime? ParseDate(string? value) =>
            DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed) ? parsed : null;

        private static int Age(DateTime? documentDate, DateTime today)
        {
            if (!documentDate.HasValue)
                return 0;
            var days = (today.Date - documentDate.Value.Date).Days;
            return days < 0 ? 0 : days;
        }

        private static string Qty(decimal value) => value.ToString("0.##", CultureInfo.InvariantCulture);
        private static string? NullIfBlank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        private static bool Eq(string? left, string right) => string.Equals(left?.Trim(), right, StringComparison.OrdinalIgnoreCase);

        private static int IndicatorRank(string indicator) => indicator switch
        {
            WorkflowStageRules.Blocked => 0,
            WorkflowStageRules.Overdue => 1,
            WorkflowStageRules.NeedsAction => 2,
            WorkflowStageRules.OnTrack => 3,
            WorkflowStageRules.Completed => 4,
            WorkflowStageRules.Cancelled => 5,
            _ => 6,
        };

        private sealed class InvoiceHit
        {
            public int Id { get; set; }
            public int OrderId { get; set; }
            public int InvoiceNo { get; set; }
            public string PrefixInvoiceNo { get; set; } = "";
            public decimal TotalAmount { get; set; }
            public decimal PaidAmount { get; set; }
            public DateTime? PaymentDate { get; set; }
            public DateTime DueDate { get; set; }
            public bool IsVoided { get; set; }
        }

        private sealed class NcrHit
        {
            public int NcrId { get; set; }
            public int? JobOrderId { get; set; }
            public string Number { get; set; } = "";
            public string Title { get; set; } = "";
            public string Status { get; set; } = "";
            public string Severity { get; set; } = "";
            public DateTime? DueDate { get; set; }
        }

        private sealed class PurchaseHit
        {
            public int VendorOrderId { get; set; }
            public int JobOrderId { get; set; }
            public string Number { get; set; } = "";
            public string? VendorName { get; set; }
            public string? Status { get; set; }
            public int QtyOrdered { get; set; }
            public int QtyReceived { get; set; }
        }
    }
}
