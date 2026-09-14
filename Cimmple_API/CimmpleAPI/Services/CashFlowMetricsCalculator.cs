using System;
using System.Collections.Generic;
using System.Linq;
using CimmpleAPI.Data;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Shared Net Cash Flow calculation used by Payment Dashboard and main Dashboard KPIs.
    /// Scopes payments by invoice/order site when a location filter is supplied.
    /// </summary>
    public static class CashFlowMetricsCalculator
    {
        public static (decimal cashIn, decimal cashOut) Calculate(
            CimmpleDbContext context,
            int tenantId,
            (DateTime startDate, DateTime endDate) dateFilter,
            int? locationId = null)
        {
            var rangeStart = dateFilter.startDate.Date;
            var rangeEnd = dateFilter.endDate.Date.AddDays(1).AddTicks(-1);

            var paymentRows = context.Transactions
                .Where(t => t.TenantId == tenantId &&
                            t.TransactionType != null &&
                            EF.Functions.Like(t.TransactionType, "%Payment%") &&
                            t.TransactionDate >= rangeStart &&
                            t.TransactionDate <= rangeEnd)
                .ToList();

            if (locationId.HasValue)
            {
                var locId = locationId.Value;
                var customerNumbers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var allCustomerNumbers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var customerInvoices = context.InvoiceMaster
                    .Where(im => im.TenantId == tenantId)
                    .Select(im => new
                    {
                        im.Id,
                        im.InvoiceNo,
                        im.PrefixInvoiceNo,
                        AtLocation = context.InvoiceDetail.Any(id =>
                            id.InvoiceId == im.Id &&
                            context.CustomerOrder.Any(co =>
                                co.OrderID == id.OrderId &&
                                co.Tenantid == tenantId &&
                                co.locationId == locId))
                    })
                    .ToList();
                foreach (var invoice in customerInvoices)
                {
                    allCustomerNumbers.Add(invoice.InvoiceNo.ToString());
                    if (!string.IsNullOrWhiteSpace(invoice.PrefixInvoiceNo))
                        allCustomerNumbers.Add(invoice.PrefixInvoiceNo.Trim());
                    if (invoice.AtLocation)
                    {
                        customerNumbers.Add(invoice.InvoiceNo.ToString());
                        if (!string.IsNullOrWhiteSpace(invoice.PrefixInvoiceNo))
                            customerNumbers.Add(invoice.PrefixInvoiceNo.Trim());
                    }
                }

                var vendorNumbers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var allVendorNumbers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var vendorInvoices = context.VendorInvoiceMaster
                    .Where(vim => vim.TenantId == tenantId)
                    .Select(vim => new { vim.InvoiceNo, vim.prefixinvoiceno, vim.locationId })
                    .ToList();
                foreach (var invoice in vendorInvoices)
                {
                    if (!string.IsNullOrWhiteSpace(invoice.InvoiceNo))
                        allVendorNumbers.Add(invoice.InvoiceNo.Trim());
                    if (!string.IsNullOrWhiteSpace(invoice.prefixinvoiceno))
                        allVendorNumbers.Add(invoice.prefixinvoiceno.Trim());
                    if (invoice.locationId == locId)
                    {
                        if (!string.IsNullOrWhiteSpace(invoice.InvoiceNo))
                            vendorNumbers.Add(invoice.InvoiceNo.Trim());
                        if (!string.IsNullOrWhiteSpace(invoice.prefixinvoiceno))
                            vendorNumbers.Add(invoice.prefixinvoiceno.Trim());
                    }
                }

                paymentRows = paymentRows.Where(t =>
                {
                    var number = t.invoiceNo?.Trim() ?? "";
                    var isCustomerPayment = t.isCustomer == 1;
                    var selected = isCustomerPayment ? customerNumbers : vendorNumbers;
                    var all = isCustomerPayment ? allCustomerNumbers : allVendorNumbers;
                    if (selected.Contains(number))
                        return true;
                    if (all.Contains(number))
                        return false;
                    return t.locationId == locId;
                }).ToList();
            }

            var cashIn = paymentRows
                .Where(t => t.isCustomer == 1)
                .Sum(t => t.Amount ?? 0);
            var cashOut = paymentRows
                .Where(t => t.isCustomer == 0 || t.isCustomer == null)
                .Sum(t => Math.Abs(t.Amount ?? 0));

            // Include historical paid invoices that have no payment transaction row.
            var customerFallback = context.InvoiceMaster
                .Where(im => im.TenantId == tenantId &&
                             !im.IsVoided &&
                             im.PaymentDate != null &&
                             im.PaymentDate >= rangeStart &&
                             im.PaymentDate <= rangeEnd &&
                             !context.Transactions.Any(t =>
                                 t.TenantId == tenantId &&
                                 t.isCustomer == 1 &&
                                 t.TransactionType != null &&
                                 EF.Functions.Like(t.TransactionType, "%Payment%") &&
                                 (t.invoiceNo == im.PrefixInvoiceNo ||
                                  t.invoiceNo == im.InvoiceNo.ToString())));
            if (locationId.HasValue)
            {
                var locId = locationId.Value;
                customerFallback = customerFallback.Where(im =>
                    context.InvoiceDetail.Any(id =>
                        id.InvoiceId == im.Id &&
                        context.CustomerOrder.Any(co =>
                            co.OrderID == id.OrderId &&
                            co.Tenantid == tenantId &&
                            co.locationId == locId)));
            }
            cashIn += customerFallback.Sum(im => (decimal?)(im.PaidAmount > 0 ? im.PaidAmount : im.TotalAmount)) ?? 0;

            var vendorFallback = context.VendorInvoiceMaster
                .Where(vim => vim.TenantId == tenantId &&
                              vim.isPaid == 1 &&
                              vim.Paydate != null &&
                              vim.Paydate >= rangeStart &&
                              vim.Paydate <= rangeEnd &&
                              !context.Transactions.Any(t =>
                                  t.TenantId == tenantId &&
                                  (t.isCustomer == 0 || t.isCustomer == null) &&
                                  t.TransactionType != null &&
                                  EF.Functions.Like(t.TransactionType, "%Payment%") &&
                                  (t.invoiceNo == vim.prefixinvoiceno ||
                                   t.invoiceNo == vim.InvoiceNo)));
            if (locationId.HasValue)
                vendorFallback = vendorFallback.Where(vim => vim.locationId == locationId.Value);
            cashOut += vendorFallback.Sum(vim => (decimal?)(vim.PaidAmount > 0 ? vim.PaidAmount : vim.TotalAmount)) ?? 0;

            return (cashIn, cashOut);
        }
    }
}
