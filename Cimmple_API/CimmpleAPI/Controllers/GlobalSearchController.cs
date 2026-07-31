using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class GlobalSearchController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;

        public GlobalSearchController(CimmpleDbContext context)
        {
            _context = context;
        }

        [HttpGet("Search")]
        public async Task<IActionResult> Search([FromQuery] string query, [FromQuery] int tenantId, [FromQuery] int limit = 10)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(query))
                {
                    return Ok(new
                    {
                        customers = new List<object>(),
                        vendors = new List<object>(),
                        orders = new List<object>(),
                        invoices = new List<object>(),
                        jobOrders = new List<object>(),
                        quotations = new List<object>(),
                        banks = new List<object>(),
                        workstations = new List<object>(),
                        locations = new List<object>(),
                        processes = new List<object>(),
                        jobTemplates = new List<object>(),
                        priceBreakdowns = new List<object>(),
                        creditCards = new List<object>(),
                        chartOfAccounts = new List<object>(),
                        vendorOrders = new List<object>(),
                        vendorInvoices = new List<object>(),
                        vendorReceiving = new List<object>(),
                        vendorQuotations = new List<object>(),
                        shipments = new List<object>(),
                        ncrReports = new List<object>(),
                        users = new List<object>(),
                        documents = new List<object>()
                    });
                }

                var searchTerm = query.Trim().ToLower();
                var results = new
                {
                    customers = await SearchCustomers(searchTerm, tenantId, limit),
                    vendors = await SearchVendors(searchTerm, tenantId, limit),
                    orders = await SearchOrders(searchTerm, tenantId, limit),
                    invoices = await SearchInvoices(searchTerm, tenantId, limit),
                    jobOrders = await SearchJobOrders(searchTerm, tenantId, limit),
                    quotations = await SearchQuotations(searchTerm, tenantId, limit),
                    banks = await SearchBanks(searchTerm, tenantId, limit),
                    workstations = await SearchWorkstations(searchTerm, tenantId, limit),
                    locations = await SearchLocations(searchTerm, tenantId, limit),
                    processes = await SearchProcesses(searchTerm, tenantId, limit),
                    jobTemplates = await SearchJobTemplates(searchTerm, tenantId, limit),
                    priceBreakdowns = await SearchPriceBreakdowns(searchTerm, tenantId, limit),
                    creditCards = await SearchCreditCards(searchTerm, tenantId, limit),
                    chartOfAccounts = await SearchChartOfAccounts(searchTerm, tenantId, limit),
                    vendorOrders = await SearchVendorOrders(searchTerm, tenantId, limit),
                    vendorInvoices = await SearchVendorInvoices(searchTerm, tenantId, limit),
                    vendorReceiving = await SearchVendorReceiving(searchTerm, tenantId, limit),
                    vendorQuotations = await SearchVendorQuotations(searchTerm, tenantId, limit),
                    shipments = await SearchShipments(searchTerm, tenantId, limit),
                    ncrReports = await SearchNCRReports(searchTerm, tenantId, limit),
                    users = await SearchUsers(searchTerm, tenantId, limit),
                    documents = await SearchDocuments(searchTerm, tenantId, limit)
                };

                return Ok(results);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[GlobalSearch] Error: {ex.Message}");
                return StatusCode(500, new { message = "Error performing search", error = ex.Message });
            }
        }

        private async Task<List<object>> SearchCustomers(string searchTerm, int tenantId, int limit)
        {
            var customers = await _context.CustomerMaster
                .Where(c => c.Tenantid == tenantId &&
                    (c.company_name != null && c.company_name.ToLower().Contains(searchTerm) ||
                     c.customercode != null && c.customercode.ToLower().Contains(searchTerm) ||
                     c.email != null && c.email.ToLower().Contains(searchTerm) ||
                     c.phone_number != null && c.phone_number.Contains(searchTerm)))
                .Take(limit)
                .Select(c => new
                {
                    id = c.customer_id,
                    type = "customer",
                    name = c.company_name ?? "",
                    code = c.customercode ?? "",
                    email = c.email ?? "",
                    phone = c.phone_number ?? "",
                    status = c.status ?? ""
                })
                .ToListAsync();

            return customers.Cast<object>().ToList();
        }

        private async Task<List<object>> SearchVendors(string searchTerm, int tenantId, int limit)
        {
            var vendors = await _context.VendorMaster
                .Where(v => v.Tenantid == tenantId &&
                    (v.company_name != null && v.company_name.ToLower().Contains(searchTerm) ||
                     v.vendorcode != null && v.vendorcode.ToLower().Contains(searchTerm) ||
                     v.email != null && v.email.ToLower().Contains(searchTerm) ||
                     v.phone_number != null && v.phone_number.Contains(searchTerm)))
                .Take(limit)
                .Select(v => new
                {
                    id = v.vendor_id,
                    type = "vendor",
                    name = v.company_name ?? "",
                    code = v.vendorcode ?? "",
                    email = v.email ?? "",
                    phone = v.phone_number ?? "",
                    status = v.status ?? ""
                })
                .ToListAsync();

            return vendors.Cast<object>().ToList();
        }

        private async Task<List<object>> SearchOrders(string searchTerm, int tenantId, int limit)
        {
            // Check if search term is a number (order ID)
            bool isNumeric = int.TryParse(searchTerm.Replace("CO#", "").Replace("co#", ""), out int orderNumber);

            var ordersQuery = _context.CustomerOrder
                .Where(o => o.Tenantid == tenantId);

            if (isNumeric)
            {
                ordersQuery = ordersQuery.Where(o => 
                    o.PONumber == orderNumber ||
                    o.PONumber.ToString().Contains(searchTerm) ||
                    o.CustomerName != null && o.CustomerName.ToLower().Contains(searchTerm) ||
                    o.CustomerPoNumber != null && o.CustomerPoNumber.ToLower().Contains(searchTerm));
            }
            else
            {
                ordersQuery = ordersQuery.Where(o =>
                    o.CustomerName != null && o.CustomerName.ToLower().Contains(searchTerm) ||
                    o.CustomerPoNumber != null && o.CustomerPoNumber.ToLower().Contains(searchTerm));
            }

            var orders = await ordersQuery
                .OrderByDescending(o => o.OrderDate)
                .Take(limit)
                .Select(o => new
                {
                    id = o.OrderID,
                    type = "order",
                    orderNumber = o.PONumber,
                    displayNumber = o.PONumber < 1000 ? $"CO#{o.PONumber + 999}" : $"CO#{o.PONumber}",
                    customerName = o.CustomerName ?? "",
                    customerPoNumber = o.CustomerPoNumber ?? "",
                    totalAmount = o.TotalAmount,
                    orderDate = o.OrderDate,
                    status = o.Status ?? ""
                })
                .ToListAsync();

            return orders.Cast<object>().ToList();
        }

        private async Task<List<object>> SearchInvoices(string searchTerm, int tenantId, int limit)
        {
            bool isNumeric = int.TryParse(searchTerm.Replace("INV#", "").Replace("inv#", ""), out int invoiceNumber);

            // Join InvoiceMaster with InvoiceDetail and CustomerOrder to get customer name
            var invoicesQuery = from invoice in _context.InvoiceMaster
                                join invoiceDetail in _context.InvoiceDetail on invoice.Id equals invoiceDetail.InvoiceId into details
                                from detail in details.DefaultIfEmpty()
                                join order in _context.CustomerOrder on detail.OrderId equals order.OrderID into orders
                                from order in orders.DefaultIfEmpty()
                                where invoice.TenantId == tenantId
                                select new { invoice, order };

            if (isNumeric)
            {
                invoicesQuery = invoicesQuery.Where(x =>
                    x.invoice.InvoiceNo.ToString().Contains(searchTerm) ||
                    (x.invoice.PrefixInvoiceNo != null && x.invoice.PrefixInvoiceNo.ToLower().Contains(searchTerm)) ||
                    (x.order != null && x.order.CustomerName != null && x.order.CustomerName.ToLower().Contains(searchTerm)));
            }
            else
            {
                invoicesQuery = invoicesQuery.Where(x =>
                    (x.order != null && x.order.CustomerName != null && x.order.CustomerName.ToLower().Contains(searchTerm)) ||
                    (x.invoice.PrefixInvoiceNo != null && x.invoice.PrefixInvoiceNo.ToLower().Contains(searchTerm)));
            }

            var invoices = await invoicesQuery
                .GroupBy(x => x.invoice.Id)
                .Select(g => new
                {
                    id = g.Key,
                    type = "invoice",
                    invoiceNumber = g.First().invoice.PrefixInvoiceNo ?? g.First().invoice.InvoiceNo.ToString(),
                    customerName = g.First().order != null ? g.First().order.CustomerName ?? "" : "",
                    totalAmount = g.First().invoice.TotalAmount,
                    invoiceDate = g.First().invoice.InvoiceDate,
                    status = g.First().invoice.PaymentDate != null ? "Paid" :
                            (g.First().invoice.DueDate < DateTime.Now && g.First().invoice.PaymentDate == null) ? "Overdue" : "Unpaid"
                })
                .OrderByDescending(x => x.invoiceDate)
                .Take(limit)
                .ToListAsync();

            return invoices.Cast<object>().ToList();
        }

        private async Task<List<object>> SearchJobOrders(string searchTerm, int tenantId, int limit)
        {
            bool isNumeric = int.TryParse(searchTerm.Replace("JO#", "").Replace("jo#", ""), out int jobOrderNumber);

            var jobOrdersQuery = _context.JobOrderMaster
                .Where(j => j.Tenantid == tenantId);

            if (isNumeric)
            {
                jobOrdersQuery = jobOrdersQuery.Where(j =>
                    j.JobOrderNumber == jobOrderNumber ||
                    j.JobOrderNumber.ToString().Contains(searchTerm) ||
                    j.PartNo != null && j.PartNo.ToLower().Contains(searchTerm) ||
                    j.CustomerName != null && j.CustomerName.ToLower().Contains(searchTerm));
            }
            else
            {
                jobOrdersQuery = jobOrdersQuery.Where(j =>
                    j.PartNo != null && j.PartNo.ToLower().Contains(searchTerm) ||
                    j.PartName != null && j.PartName.ToLower().Contains(searchTerm) ||
                    j.CustomerName != null && j.CustomerName.ToLower().Contains(searchTerm) ||
                    j.JobNumber != null && j.JobNumber.ToLower().Contains(searchTerm));
            }

            var jobOrders = await jobOrdersQuery
                .OrderByDescending(j => j.OrderDate)
                .Take(limit)
                .Select(j => new
                {
                    id = j.JobOrderID,
                    type = "jobOrder",
                    jobOrderNumber = j.JobOrderNumber,
                    displayNumber = j.JobOrderNumber < 1000 ? $"JO#{j.JobOrderNumber + 999}" : $"JO#{j.JobOrderNumber}",
                    customerName = j.CustomerName ?? "",
                    partNo = j.PartNo ?? "",
                    partName = j.PartName ?? "",
                    jobNumber = j.JobNumber ?? "",
                    dueDate = j.DueDate,
                    status = j.Status ?? ""
                })
                .ToListAsync();

            return jobOrders.Cast<object>().ToList();
        }

        private async Task<List<object>> SearchQuotations(string searchTerm, int tenantId, int limit)
        {
            bool isNumeric = int.TryParse(searchTerm.Replace("CQ#", "").Replace("cq#", ""), out int quotationNumber);

            var quotationsQuery = _context.QuotationOrder
                .Where(q => q.Tenantid == tenantId);

            if (isNumeric)
            {
                quotationsQuery = quotationsQuery.Where(q =>
                    q.PONumber == quotationNumber ||
                    q.PONumber.ToString().Contains(searchTerm) ||
                    q.CustomerName != null && q.CustomerName.ToLower().Contains(searchTerm));
            }
            else
            {
                quotationsQuery = quotationsQuery.Where(q =>
                    q.CustomerName != null && q.CustomerName.ToLower().Contains(searchTerm));
            }

            var quotations = await quotationsQuery
                .OrderByDescending(q => q.OrderDate)
                .Take(limit)
                .Select(q => new
                {
                    id = q.OrderID,
                    type = "quotation",
                    quotationNumber = q.PONumber,
                    displayNumber = q.PONumber < 1000 ? $"CQ#{q.PONumber + 999}" : $"CQ#{q.PONumber}",
                    customerName = q.CustomerName ?? "",
                    totalAmount = q.TotalAmount,
                    orderDate = q.OrderDate,
                    status = q.Status ?? ""
                })
                .ToListAsync();

            return quotations.Cast<object>().ToList();
        }

        // Master Data Search Methods
        private async Task<List<object>> SearchBanks(string searchTerm, int tenantId, int limit)
        {
            var banks = await _context.BankMaster
                .Where(b => b.TenantId == tenantId &&
                    (b.BankName != null && b.BankName.ToLower().Contains(searchTerm) ||
                     b.Bankcode != null && b.Bankcode.ToLower().Contains(searchTerm) ||
                     b.AccountNo != null && b.AccountNo.ToLower().Contains(searchTerm) ||
                     b.displayname != null && b.displayname.ToLower().Contains(searchTerm)))
                .Take(limit)
                .Select(b => new
                {
                    id = b.Id,
                    type = "bank",
                    name = b.BankName ?? "",
                    code = b.Bankcode ?? "",
                    accountNo = b.AccountNo ?? "",
                    displayName = b.displayname ?? ""
                })
                .ToListAsync();

            return banks.Cast<object>().ToList();
        }

        private async Task<List<object>> SearchWorkstations(string searchTerm, int tenantId, int limit)
        {
            var workstations = await _context.WorkstationMaster
                .Where(w => w.TenantId == tenantId &&
                    (w.WorkstationName != null && w.WorkstationName.ToLower().Contains(searchTerm)))
                .Take(limit)
                .Select(w => new
                {
                    id = w.Id,
                    type = "workstation",
                    name = w.WorkstationName ?? "",
                    isActive = w.IsActive
                })
                .ToListAsync();

            return workstations.Cast<object>().ToList();
        }

        private async Task<List<object>> SearchLocations(string searchTerm, int tenantId, int limit)
        {
            var locations = await _context.Locations
                .Where(l => l.TenantId == tenantId &&
                    (l.Name != null && l.Name.ToLower().Contains(searchTerm) ||
                     l.Code != null && l.Code.ToLower().Contains(searchTerm) ||
                     l.city != null && l.city.ToLower().Contains(searchTerm)))
                .Take(limit)
                .Select(l => new
                {
                    id = l.LocationId,
                    type = "location",
                    name = l.Name ?? "",
                    code = l.Code ?? "",
                    city = l.city ?? "",
                    state = l.state ?? ""
                })
                .ToListAsync();

            return locations.Cast<object>().ToList();
        }

        private async Task<List<object>> SearchProcesses(string searchTerm, int tenantId, int limit)
        {
            var processes = await _context.ProcessMaster
                .Where(p => p.Tenantid == tenantId &&
                    (p.ProcessName != null && p.ProcessName.ToLower().Contains(searchTerm) ||
                     p.ProcessCode != null && p.ProcessCode.ToLower().Contains(searchTerm) ||
                     p.PDescription != null && p.PDescription.ToLower().Contains(searchTerm) ||
                     p.ProcessCategory != null && p.ProcessCategory.ToLower().Contains(searchTerm) ||
                     p.ledgercode != null && p.ledgercode.ToLower().Contains(searchTerm)))
                .Take(limit)
                .Select(p => new
                {
                    id = p.Id,
                    type = "process",
                    name = p.ProcessName ?? "",
                    code = p.ProcessCode ?? "",
                    description = p.PDescription ?? "",
                    category = p.ProcessCategory ?? "",
                    ledgerCode = p.ledgercode ?? "",
                    status = p.status
                })
                .ToListAsync();

            return processes.Cast<object>().ToList();
        }

        private async Task<List<object>> SearchJobTemplates(string searchTerm, int tenantId, int limit)
        {
            var jobTemplates = await _context.JobTemplateMaster
                .Where(t => t.Tenantid == tenantId &&
                    (t.TemplateName != null && t.TemplateName.ToLower().Contains(searchTerm) ||
                     t.TemplateCode != null && t.TemplateCode.ToLower().Contains(searchTerm) ||
                     t.Description != null && t.Description.ToLower().Contains(searchTerm)))
                .Take(limit)
                .Select(t => new
                {
                    id = t.Id,
                    type = "jobTemplate",
                    name = t.TemplateName ?? "",
                    code = t.TemplateCode ?? "",
                    description = t.Description ?? "",
                    revision = t.Revision,
                    status = t.Status
                })
                .ToListAsync();

            return jobTemplates.Cast<object>().ToList();
        }

        private async Task<List<object>> SearchPriceBreakdowns(string searchTerm, int tenantId, int limit)
        {
            var priceBreakdowns = await _context.PriceBreakdownMaster
                .Where(p => p.Tenantid == tenantId &&
                    (p.ItemName != null && p.ItemName.ToLower().Contains(searchTerm)))
                .Take(limit)
                .Select(p => new
                {
                    id = p.Id,
                    type = "priceBreakdown",
                    name = p.ItemName ?? "",
                    status = p.Status
                })
                .ToListAsync();

            return priceBreakdowns.Cast<object>().ToList();
        }

        private async Task<List<object>> SearchCreditCards(string searchTerm, int tenantId, int limit)
        {
            var creditCards = await _context.CreditCardMaster
                .Where(c => c.TenantId == tenantId &&
                    (c.CardholderName != null && c.CardholderName.ToLower().Contains(searchTerm) ||
                     c.NickName != null && c.NickName.ToLower().Contains(searchTerm) ||
                     c.LastFourDigits != null && c.LastFourDigits.Contains(searchTerm)))
                .Take(limit)
                .Select(c => new
                {
                    id = c.Id,
                    type = "creditCard",
                    name = c.CardholderName ?? "",
                    nickName = c.NickName ?? "",
                    lastFourDigits = c.LastFourDigits ?? "",
                    cardType = c.CardType ?? ""
                })
                .ToListAsync();

            return creditCards.Cast<object>().ToList();
        }

        private async Task<List<object>> SearchChartOfAccounts(string searchTerm, int tenantId, int limit)
        {
            var accounts = await _context.ChartofAccounts
                .Where(a => a.Tenantid == tenantId &&
                    (a.AccountName != null && a.AccountName.ToLower().Contains(searchTerm) ||
                     a.AccountCode != null && a.AccountCode.ToLower().Contains(searchTerm)))
                .Take(limit)
                .Select(a => new
                {
                    id = a.AccountID,
                    type = "chartOfAccount",
                    name = a.AccountName ?? "",
                    code = a.AccountCode ?? "",
                    accountType = a.AccountType ?? "",
                    isActive = a.IsActive
                })
                .ToListAsync();

            return accounts.Cast<object>().ToList();
        }

        // Purchasing Search Methods
        private async Task<List<object>> SearchVendorOrders(string searchTerm, int tenantId, int limit)
        {
            bool isNumeric = int.TryParse(searchTerm.Replace("VO#", "").Replace("vo#", ""), out int orderNumber);

            var vendorOrdersQuery = _context.VendorOrders
                .Where(v => v.Tenantid == tenantId);

            if (isNumeric)
            {
                vendorOrdersQuery = vendorOrdersQuery.Where(v =>
                    v.PONumber == orderNumber ||
                    v.PONumber.ToString().Contains(searchTerm) ||
                    v.VendorName != null && v.VendorName.ToLower().Contains(searchTerm) ||
                    v.VendorPoNumber != null && v.VendorPoNumber.ToLower().Contains(searchTerm));
            }
            else
            {
                vendorOrdersQuery = vendorOrdersQuery.Where(v =>
                    v.VendorName != null && v.VendorName.ToLower().Contains(searchTerm) ||
                    v.VendorPoNumber != null && v.VendorPoNumber.ToLower().Contains(searchTerm));
            }

            var vendorOrders = await vendorOrdersQuery
                .OrderByDescending(v => v.OrderDate)
                .Take(limit)
                .Select(v => new
                {
                    id = v.OrderID,
                    type = "vendorOrder",
                    orderNumber = v.PONumber,
                    displayNumber = v.PONumber < 1000 ? $"VO#{v.PONumber + 999}" : $"VO#{v.PONumber}",
                    vendorName = v.VendorName ?? "",
                    vendorPoNumber = v.VendorPoNumber ?? "",
                    totalAmount = v.TotalAmount,
                    orderDate = v.OrderDate,
                    status = v.Status ?? ""
                })
                .ToListAsync();

            return vendorOrders.Cast<object>().ToList();
        }

        private async Task<List<object>> SearchVendorInvoices(string searchTerm, int tenantId, int limit)
        {
            bool isNumeric = int.TryParse(searchTerm.Replace("VI#", "").Replace("vi#", ""), out int invoiceNumber);

            var vendorInvoicesQuery = _context.VendorInvoiceMaster
                .Where(v => v.TenantId == tenantId);

            if (isNumeric)
            {
                vendorInvoicesQuery = vendorInvoicesQuery.Where(v =>
                    v.InvoiceNo != null && v.InvoiceNo.ToLower().Contains(searchTerm) ||
                    v.VendorName != null && v.VendorName.ToLower().Contains(searchTerm));
            }
            else
            {
                vendorInvoicesQuery = vendorInvoicesQuery.Where(v =>
                    v.VendorName != null && v.VendorName.ToLower().Contains(searchTerm) ||
                    v.InvoiceNo != null && v.InvoiceNo.ToLower().Contains(searchTerm));
            }

            var vendorInvoices = await vendorInvoicesQuery
                .OrderByDescending(v => v.InvoiceDate)
                .Take(limit)
                .Select(v => new
                {
                    id = v.Id,
                    type = "vendorInvoice",
                    invoiceNumber = v.InvoiceNo ?? "",
                    vendorName = v.VendorName ?? "",
                    totalAmount = v.TotalAmount,
                    invoiceDate = v.InvoiceDate,
                    dueDate = v.DueDate,
                    status = v.isPaid == 1 ? "Paid" : (v.DueDate < DateTime.Now ? "Overdue" : "Unpaid")
                })
                .ToListAsync();

            return vendorInvoices.Cast<object>().ToList();
        }

        private async Task<List<object>> SearchVendorReceiving(string searchTerm, int tenantId, int limit)
        {
            bool isNumeric = int.TryParse(searchTerm, out int receivingId);

            var receivingQuery = from receivingRec in _context.VendorReceiving
                                join orderDetail in _context.VendorOrderDetails on receivingRec.VendorOrderDetailID equals orderDetail.ID into details
                                from detail in details.DefaultIfEmpty()
                                join vendorOrder in _context.VendorOrders on detail.OrderID equals vendorOrder.OrderID into orders
                                from order in orders.DefaultIfEmpty()
                                where receivingRec.Tenantid == tenantId
                                select new { receivingRec, order };

            if (isNumeric)
            {
                receivingQuery = receivingQuery.Where(x =>
                    x.receivingRec.ID == receivingId ||
                    x.receivingRec.ID.ToString().Contains(searchTerm) ||
                    (x.order != null && x.order.VendorName != null && x.order.VendorName.ToLower().Contains(searchTerm)));
            }
            else
            {
                receivingQuery = receivingQuery.Where(x =>
                    (x.order != null && x.order.VendorName != null && x.order.VendorName.ToLower().Contains(searchTerm)));
            }

            var receivingResults = await receivingQuery
                .GroupBy(x => x.receivingRec.ID)
                .Select(g => new
                {
                    id = g.Key,
                    type = "vendorReceiving",
                    receivingId = g.Key,
                    vendorName = g.First().order != null ? g.First().order.VendorName ?? "" : "",
                    receivedDate = g.First().receivingRec.ReceivedDate,
                    receivedQty = g.First().receivingRec.ReceivedQty
                })
                .OrderByDescending(x => x.receivedDate)
                .Take(limit)
                .ToListAsync();

            return receivingResults.Cast<object>().ToList();
        }

        private async Task<List<object>> SearchVendorQuotations(string searchTerm, int tenantId, int limit)
        {
            bool isNumeric = int.TryParse(searchTerm.Replace("VQ#", "").Replace("vq#", ""), out int quotationNumber);

            var vendorQuotationsQuery = _context.VendorQuotations
                .Where(v => v.Tenantid == tenantId);

            if (isNumeric)
            {
                vendorQuotationsQuery = vendorQuotationsQuery.Where(v =>
                    v.PONumber == quotationNumber ||
                    v.PONumber.ToString().Contains(searchTerm) ||
                    v.VendorName != null && v.VendorName.ToLower().Contains(searchTerm));
            }
            else
            {
                vendorQuotationsQuery = vendorQuotationsQuery.Where(v =>
                    v.VendorName != null && v.VendorName.ToLower().Contains(searchTerm));
            }

            var vendorQuotations = await vendorQuotationsQuery
                .OrderByDescending(v => v.OrderDate)
                .Take(limit)
                .Select(v => new
                {
                    id = v.OrderID,
                    type = "vendorQuotation",
                    quotationNumber = v.PONumber,
                    displayNumber = v.PONumber < 1000 ? $"VQ#{v.PONumber + 999}" : $"VQ#{v.PONumber}",
                    vendorName = v.VendorName ?? "",
                    totalAmount = v.TotalAmount,
                    orderDate = v.OrderDate,
                    status = v.Status ?? ""
                })
                .ToListAsync();

            return vendorQuotations.Cast<object>().ToList();
        }

        // Shipping Search Method
        private async Task<List<object>> SearchShipments(string searchTerm, int tenantId, int limit)
        {
            var shipmentsQuery = from shipment in _context.Shipping
                                join order in _context.CustomerOrder on shipment.OrderId equals order.OrderID into orders
                                from order in orders.DefaultIfEmpty()
                                where shipment.TenantId == tenantId
                                select new { shipment, order };

            shipmentsQuery = shipmentsQuery.Where(x =>
                (x.shipment.ShipmentNo != null && x.shipment.ShipmentNo.ToLower().Contains(searchTerm)) ||
                (x.shipment.CourierTrackingNo != null && x.shipment.CourierTrackingNo.ToLower().Contains(searchTerm)) ||
                (x.order != null && x.order.CustomerName != null && x.order.CustomerName.ToLower().Contains(searchTerm)));

            var shipments = await shipmentsQuery
                .GroupBy(x => x.shipment.Id)
                .Select(g => new
                {
                    id = g.Key,
                    type = "shipment",
                    shipmentNo = g.First().shipment.ShipmentNo ?? "",
                    trackingNo = g.First().shipment.CourierTrackingNo ?? "",
                    customerName = g.First().order != null ? g.First().order.CustomerName ?? "" : "",
                    shipmentDate = g.First().shipment.ShipmentDate,
                    shipVia = g.First().shipment.ShipVia ?? ""
                })
                .OrderByDescending(x => x.shipmentDate)
                .Take(limit)
                .ToListAsync();

            return shipments.Cast<object>().ToList();
        }

        // Quality Search Method
        private async Task<List<object>> SearchNCRReports(string searchTerm, int tenantId, int limit)
        {
            bool isNumeric = int.TryParse(searchTerm.Replace("NCR#", "").Replace("ncr#", ""), out int ncrNumber);

            var ncrQuery = _context.NonConformanceReports
                .Where(n => n.TenantId == tenantId);

            if (isNumeric)
            {
                ncrQuery = ncrQuery.Where(n =>
                    n.NcrNumber != null && n.NcrNumber.Contains(searchTerm) ||
                    n.PartNo != null && n.PartNo.ToLower().Contains(searchTerm) ||
                    n.CustomerName != null && n.CustomerName.ToLower().Contains(searchTerm) ||
                    n.JobOrderNumber != null && n.JobOrderNumber.Contains(searchTerm));
            }
            else
            {
                ncrQuery = ncrQuery.Where(n =>
                    n.Title != null && n.Title.ToLower().Contains(searchTerm) ||
                    n.PartNo != null && n.PartNo.ToLower().Contains(searchTerm) ||
                    n.PartName != null && n.PartName.ToLower().Contains(searchTerm) ||
                    n.CustomerName != null && n.CustomerName.ToLower().Contains(searchTerm) ||
                    n.JobOrderNumber != null && n.JobOrderNumber.ToLower().Contains(searchTerm));
            }

            var ncrReports = await ncrQuery
                .OrderByDescending(n => n.ReportedDate)
                .Take(limit)
                .Select(n => new
                {
                    id = n.NcrId,
                    type = "ncrReport",
                    ncrNumber = n.NcrNumber ?? "",
                    title = n.Title ?? "",
                    partNo = n.PartNo ?? "",
                    partName = n.PartName ?? "",
                    customerName = n.CustomerName ?? "",
                    jobOrderNumber = n.JobOrderNumber ?? "",
                    status = n.Status ?? "",
                    severity = n.Severity ?? "",
                    reportedDate = n.ReportedDate
                })
                .ToListAsync();

            return ncrReports.Cast<object>().ToList();
        }

        // User Search Method
        private async Task<List<object>> SearchUsers(string searchTerm, int tenantId, int limit)
        {
            var users = await _context.UserDetails
                .Where(u => u.TenantID == tenantId &&
                    ((u.FirstName != null && u.FirstName.ToLower().Contains(searchTerm)) ||
                     (u.LastName != null && u.LastName.ToLower().Contains(searchTerm)) ||
                     (u.Email != null && u.Email.ToLower().Contains(searchTerm)) ||
                     (u.UserName != null && u.UserName.ToLower().Contains(searchTerm)) ||
                     (u.EmpCode != null && u.EmpCode.ToLower().Contains(searchTerm))))
                .Take(limit)
                .Select(u => new
                {
                    id = u.User_UniqueID,
                    type = "user",
                    firstName = u.FirstName ?? "",
                    lastName = u.LastName ?? "",
                    email = u.Email ?? "",
                    userName = u.UserName ?? "",
                    empCode = u.EmpCode ?? "",
                    status = u.Status ?? ""
                })
                .ToListAsync();

            return users.Cast<object>().ToList();
        }

        // Document Search Method
        private async Task<List<object>> SearchDocuments(string searchTerm, int tenantId, int limit)
        {
            try
            {
                // Use exact same pattern as DocumentsController.GetDocuments which works correctly
                var documents = await _context.Documents
                    .Include(d => d.Category)
                    .Where(d => d.TenantId == tenantId && !d.IsDeleted &&
                        (d.DocumentName.ToLower().Contains(searchTerm) ||
                         (d.DocumentNumber != null && d.DocumentNumber.ToLower().Contains(searchTerm)) ||
                         (d.Description != null && d.Description.ToLower().Contains(searchTerm)) ||
                         (d.Tags != null && d.Tags.ToLower().Contains(searchTerm))))
                    .Take(limit)
                    .Select(d => new
                    {
                        id = d.Id,
                        type = "document",
                        name = d.DocumentName ?? "",
                        documentNumber = d.DocumentNumber ?? "",
                        description = d.Description ?? "",
                        categoryName = d.Category != null ? d.Category.CategoryName : "",
                        requiresVersionControl = d.RequiresVersionControl,
                        currentVersionNumber = d.CurrentVersionNumber,
                        isDocumentNumberAutoGenerated = d.IsDocumentNumberAutoGenerated
                    })
                    .ToListAsync();

                Console.WriteLine($"[GlobalSearch] SearchDocuments: searchTerm='{searchTerm}', tenantId={tenantId}, found {documents.Count} documents");
                
                return documents.Cast<object>().ToList();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[GlobalSearch] SearchDocuments error: {ex.Message}");
                Console.WriteLine($"[GlobalSearch] Stack trace: {ex.StackTrace}");
                return new List<object>();
            }
        }
    }
}

