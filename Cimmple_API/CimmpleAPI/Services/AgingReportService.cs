using CimmpleAPI.Data;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services
{
    /// <summary>Shared AR/AP aging builders used by financial reports and scheduled email.</summary>
    public static class AgingReportService
    {
        public static object BuildArAging(CimmpleDbContext context, int tenantId, DateTime asOfDate, int? locationId = null)
        {
            var agingData = CalculateArAging(context, tenantId, asOfDate.Date, locationId);
            return new
            {
                reportType = "AR Aging Report",
                asOfDate = asOfDate.Date.ToString("yyyy-MM-dd"),
                locationId,
                agingBuckets = agingData
            };
        }

        public static object BuildApAging(CimmpleDbContext context, int tenantId, DateTime asOfDate, int? locationId = null)
        {
            var agingData = CalculateApAging(context, tenantId, asOfDate.Date, locationId);
            return new
            {
                reportType = "AP Aging Report",
                asOfDate = asOfDate.Date.ToString("yyyy-MM-dd"),
                locationId,
                agingBuckets = agingData
            };
        }

        public static object CalculateArAging(CimmpleDbContext context, int tenantId, DateTime asOfDate, int? locationId = null)
        {
            try
            {
                var unpaidInvoicesQuery = context.InvoiceMaster
                    .Where(im => im.TenantId == tenantId &&
                                 !im.IsVoided &&
                                 im.PaidAmount < im.TotalAmount - 0.009m &&
                                 im.InvoiceDate <= asOfDate);
                if (locationId.HasValue)
                {
                    var locId = locationId.Value;
                    unpaidInvoicesQuery = unpaidInvoicesQuery.Where(im =>
                        context.InvoiceDetail.Any(id =>
                            id.InvoiceId == im.Id &&
                            context.CustomerOrder.Any(co =>
                                co.OrderID == id.OrderId &&
                                co.Tenantid == tenantId &&
                                co.locationId == locId)));
                }

                var unpaidInvoices = unpaidInvoicesQuery.ToList();

                var invoiceIds = unpaidInvoices.Select(i => i.Id).ToList();
                var customerByInvoice = (
                    from id in context.InvoiceDetail.AsNoTracking()
                    join co in context.CustomerOrder.AsNoTracking() on id.OrderId equals co.OrderID
                    where invoiceIds.Contains(id.InvoiceId) && co.Tenantid == tenantId
                    select new { id.InvoiceId, co.CustomerName, co.CustomerID }
                ).ToList()
                 .GroupBy(x => x.InvoiceId)
                 .ToDictionary(g => g.Key, g => g.First());

                var items = unpaidInvoices.Select(im =>
                    new AccountingRules.AgingItem(
                        im.DueDate,
                        AccountingRules.OpenBalance(im.TotalAmount, im.PaidAmount)));

                var buckets = AccountingRules.CalculateAgingBuckets(items, asOfDate);
                var total = buckets.Sum(b => b.Amount);

                var invoicesByBucket = unpaidInvoices
                    .Select(im =>
                    {
                        customerByInvoice.TryGetValue(im.Id, out var cust);
                        return new
                        {
                            bucket = AccountingRules.AgingBucketName(im.DueDate, asOfDate),
                            invoiceId = im.Id,
                            invoiceNo = string.IsNullOrWhiteSpace(im.PrefixInvoiceNo)
                                ? im.InvoiceNo.ToString()
                                : im.PrefixInvoiceNo,
                            invoiceDate = im.InvoiceDate.ToString("yyyy-MM-dd"),
                            dueDate = im.DueDate.ToString("yyyy-MM-dd"),
                            customerId = cust?.CustomerID,
                            customerName = cust?.CustomerName ?? "",
                            openBalance = AccountingRules.OpenBalance(im.TotalAmount, im.PaidAmount),
                            linkPath = "/orders/customer-invoices"
                        };
                    })
                    .GroupBy(x => x.bucket)
                    .ToDictionary(g => g.Key, g => g.OrderBy(x => x.dueDate).ToList());

                return buckets.Select(b =>
                {
                    invoicesByBucket.TryGetValue(b.Name, out var invList);
                    return new
                    {
                        bucket = b.Name,
                        amount = b.Amount,
                        percentage = b.Percentage(total),
                        invoices = (object?)invList ?? Array.Empty<object>()
                    };
                }).ToArray();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error calculating AR aging: {ex.Message}");
                return EmptyAgingBuckets();
            }
        }

        public static object CalculateApAging(CimmpleDbContext context, int tenantId, DateTime asOfDate, int? locationId = null)
        {
            try
            {
                var unpaidInvoicesQuery = context.VendorInvoiceMaster
                    .Where(vim => vim.TenantId == tenantId &&
                                  vim.voideddate == null &&
                                  vim.PaidAmount < vim.TotalAmount - 0.009m &&
                                  vim.InvoiceDate <= asOfDate);
                if (locationId.HasValue)
                    unpaidInvoicesQuery = unpaidInvoicesQuery.Where(vim => vim.locationId == locationId.Value);

                var unpaidInvoices = unpaidInvoicesQuery.ToList();

                var items = unpaidInvoices.Select(vim =>
                    new AccountingRules.AgingItem(
                        vim.DueDate,
                        AccountingRules.OpenBalance(vim.TotalAmount, vim.PaidAmount)));

                var buckets = AccountingRules.CalculateAgingBuckets(items, asOfDate);
                var total = buckets.Sum(b => b.Amount);

                var invoicesByBucket = unpaidInvoices
                    .Select(vim => new
                    {
                        bucket = AccountingRules.AgingBucketName(vim.DueDate, asOfDate),
                        invoiceId = vim.Id,
                        invoiceNo = !string.IsNullOrWhiteSpace(vim.prefixinvoiceno)
                            ? vim.prefixinvoiceno
                            : (vim.InvoiceNo ?? vim.Id.ToString()),
                        invoiceDate = vim.InvoiceDate.ToString("yyyy-MM-dd"),
                        dueDate = vim.DueDate.ToString("yyyy-MM-dd"),
                        vendorId = vim.vid,
                        vendorName = vim.VendorName ?? "",
                        openBalance = AccountingRules.OpenBalance(vim.TotalAmount, vim.PaidAmount),
                        linkPath = "/purchasing/vendor-invoices"
                    })
                    .GroupBy(x => x.bucket)
                    .ToDictionary(g => g.Key, g => g.OrderBy(x => x.dueDate).ToList());

                return buckets.Select(b =>
                {
                    invoicesByBucket.TryGetValue(b.Name, out var invList);
                    return new
                    {
                        bucket = b.Name,
                        amount = b.Amount,
                        percentage = b.Percentage(total),
                        invoices = (object?)invList ?? Array.Empty<object>()
                    };
                }).ToArray();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error calculating AP aging: {ex.Message}");
                return EmptyAgingBuckets();
            }
        }

        private static object EmptyAgingBuckets() => new[]
        {
            new { bucket = "Current", amount = 0m, percentage = 0m, invoices = (object)Array.Empty<object>() },
            new { bucket = "1-30 Days", amount = 0m, percentage = 0m, invoices = (object)Array.Empty<object>() },
            new { bucket = "31-60 Days", amount = 0m, percentage = 0m, invoices = (object)Array.Empty<object>() },
            new { bucket = "61-90 Days", amount = 0m, percentage = 0m, invoices = (object)Array.Empty<object>() },
            new { bucket = "Over 90 Days", amount = 0m, percentage = 0m, invoices = (object)Array.Empty<object>() }
        };
    }
}
