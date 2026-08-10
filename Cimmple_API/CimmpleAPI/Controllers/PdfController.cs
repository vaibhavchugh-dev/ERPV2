using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Hosting;
using System.IO;
using System.Text.Json;
using CimmpleAPI.Services.Pdf;
using CimmpleAPI.Services.Pdf.Models;
using CimmpleAPI.Data;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PdfController : ApiBaseController
    {
        private readonly PdfService _pdfService;
        private readonly CimmpleDbContext _context;
        private readonly IWebHostEnvironment _environment;

        public PdfController(PdfService pdfService, CimmpleDbContext context, IWebHostEnvironment environment)
        {
            _pdfService = pdfService;
            _context = context;
            _environment = environment;
        }

        [HttpGet("GenerateQuotation")]
        public async Task<IActionResult> GenerateQuotation([FromQuery] int quotationId, [FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            try
            {
                var quotation = await _context.QuotationOrder
                    .FirstOrDefaultAsync(q => q.OrderID == quotationId && q.Tenantid == tenantId);

                if (quotation == null)
                    return NotFound(new { error = "Quotation not found" });

                var quotationDetails = await _context.QuotationOrderDetails
                    .Where(d => d.OrderID == quotationId && d.Tenantid == tenantId)
                    .OrderBy(d => d.ItemNo)
                    .ToListAsync();

                var customer = await _context.CustomerMaster
                    .FirstOrDefaultAsync(c => c.customer_id == quotation.CustomerID && c.Tenantid == tenantId);

                // Get company info from Location or EntityMaster (fallback)
                var companyInfo = await GetCompanyInfo(tenantId, locationId);

                // Build PDF data
                var pdfData = new PdfDocumentData
                {
                    CompanyName = companyInfo.CompanyName,
                    CompanyAddress = companyInfo.CompanyAddress,
                    CompanyCityStateZip = companyInfo.CompanyCityStateZip,
                    CompanyEmail = companyInfo.CompanyEmail,
                    CompanyPhone = companyInfo.CompanyPhone,
                    CompanyWebAddress = companyInfo.CompanyWebAddress,
                    LogoPath = companyInfo.LogoPath,
                    CustomerName = quotation.CustomerName ?? "",
                    BillingAddress = BuildBillingAddress(customer),
                    ShippingAddress = BuildShippingAddress(customer),
                    BuyerName = quotation.BuyerName ?? "",
                    PhoneNumber = customer?.phone_number ?? "",
                    LineItems = quotationDetails.Select(d =>
                    {
                        var subtotal = d.QtyOrdered * d.UnitPrice;
                        var discountAmount = CalculateDiscountAmount(subtotal, d.Discount, d.DiscountType);
                        return new PdfLineItem
                        {
                            PartNo = d.PartNo ?? "",
                            PartDescription = d.partname ?? "",
                            Date = FormatDate(d.DueDate),
                            Unit = d.Unit ?? "EA",
                            Qty = d.QtyOrdered,
                            UnitPrice = d.UnitPrice,
                            DiscountAmount = discountAmount,
                            Amount = subtotal - discountAmount,
                            Notes = d.notes ?? "",
                            PrintQtyOptions = BuildPrintQtyOptions(d.QuantityTiers, d.Discount, d.DiscountType)
                        };
                    }).ToList(),
                    TotalAmount = quotation.TotalAmount
                };

                var quotationNumber = quotation.PONumber < 1000 
                    ? $"CQ#{quotation.PONumber + 999}" 
                    : $"CQ#{quotation.PONumber}";

                var pdfBytes = _pdfService.GenerateQuotationPdf(
                    pdfData,
                    quotationNumber,
                    FormatDate(quotation.OrderDate),
                    quotation.CustomerRefNo ?? ""
                );

                return File(pdfBytes, "application/pdf", $"Quotation_{quotationNumber}_{DateTime.Now:yyyy-MM-dd}.pdf");
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GenerateOrder")]
        public async Task<IActionResult> GenerateOrder([FromQuery] int orderId, [FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            try
            {
                var order = await _context.CustomerOrder
                    .FirstOrDefaultAsync(o => o.OrderID == orderId && o.Tenantid == tenantId);

                if (order == null)
                    return NotFound(new { error = "Order not found" });

                var orderDetails = await _context.CustomerOrderDetails
                    .Where(d => d.OrderID == orderId && d.Tenantid == tenantId)
                    .OrderBy(d => d.ItemNo)
                    .ToListAsync();

                var customer = await _context.CustomerMaster
                    .FirstOrDefaultAsync(c => c.customer_id == order.CustomerID && c.Tenantid == tenantId);

                // Get company info from Location or EntityMaster (fallback)
                var companyInfo = await GetCompanyInfo(tenantId, locationId);

                // Build PDF data
                var pdfData = new PdfDocumentData
                {
                    CompanyName = companyInfo.CompanyName,
                    CompanyAddress = companyInfo.CompanyAddress,
                    CompanyCityStateZip = companyInfo.CompanyCityStateZip,
                    CompanyEmail = companyInfo.CompanyEmail,
                    CompanyPhone = companyInfo.CompanyPhone,
                    CompanyWebAddress = companyInfo.CompanyWebAddress,
                    LogoPath = companyInfo.LogoPath,
                    CustomerName = order.CustomerName ?? "",
                    BillingAddress = BuildBillingAddress(customer),
                    ShippingAddress = BuildShippingAddress(customer),
                    BuyerName = order.BuyerName ?? "",
                    PhoneNumber = customer?.phone_number ?? "",
                    LineItems = orderDetails.Select(d =>
                    {
                        var subtotal = d.QtyOrdered * d.UnitPrice;
                        var discountAmount = CalculateDiscountAmount(subtotal, d.Discount, d.DiscountType);
                        return new PdfLineItem
                        {
                            PartNo = d.PartNo ?? "",
                            PartDescription = d.partname ?? "",
                            Date = FormatDate(d.DueDate),
                            Unit = d.Unit ?? "EA",
                            Qty = d.QtyOrdered,
                            UnitPrice = d.UnitPrice,
                            DiscountAmount = discountAmount,
                            Amount = subtotal - discountAmount,
                            Notes = d.notes ?? ""
                        };
                    }).ToList(),
                    TotalAmount = order.TotalAmount
                };

                var orderNumber = order.PONumber < 1000 
                    ? $"CO#{order.PONumber + 999}" 
                    : $"CO#{order.PONumber}";

                var pdfBytes = _pdfService.GenerateOrderPdf(
                    pdfData,
                    orderNumber,
                    FormatDate(order.OrderDate),
                    order.QuotationNo ?? ""
                );

                return File(pdfBytes, "application/pdf", $"Order_{orderNumber}_{DateTime.Now:yyyy-MM-dd}.pdf");
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        private List<string> BuildBillingAddress(Data.Models.CustomerMaster? customer)
        {
            var address = new List<string>();
            if (customer == null) return address;

            if (!string.IsNullOrEmpty(customer.address))
                address.Add(customer.address);
            if (!string.IsNullOrEmpty(customer.apartment))
                address.Add(customer.apartment);
            
            var cityStateZip = new List<string>();
            if (!string.IsNullOrEmpty(customer.city)) cityStateZip.Add(customer.city);
            if (!string.IsNullOrEmpty(customer.state)) cityStateZip.Add(customer.state);
            if (!string.IsNullOrEmpty(customer.zip)) cityStateZip.Add(customer.zip);
            if (cityStateZip.Any())
                address.Add(string.Join(", ", cityStateZip));
            if (!string.IsNullOrEmpty(customer.country))
                address.Add(customer.country);

            return address;
        }

        private List<string> BuildShippingAddress(Data.Models.CustomerMaster? customer)
        {
            var address = new List<string>();
            if (customer == null) return address;

            if (!string.IsNullOrEmpty(customer.shippingAddress))
                address.Add(customer.shippingAddress);
            if (!string.IsNullOrEmpty(customer.shippingApartment))
                address.Add(customer.shippingApartment);
            
            var cityStateZip = new List<string>();
            if (!string.IsNullOrEmpty(customer.shippingCity)) cityStateZip.Add(customer.shippingCity);
            if (!string.IsNullOrEmpty(customer.shippingStates)) cityStateZip.Add(customer.shippingStates);
            if (!string.IsNullOrEmpty(customer.shippingZipCode)) cityStateZip.Add(customer.shippingZipCode);
            if (cityStateZip.Any())
                address.Add(string.Join(", ", cityStateZip));
            if (!string.IsNullOrEmpty(customer.shippingCountry))
                address.Add(customer.shippingCountry);

            return address;
        }

        [HttpGet("GenerateInvoice")]
        public async Task<IActionResult> GenerateInvoice([FromQuery] int invoiceId, [FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            try
            {
                var invoice = await _context.InvoiceMaster
                    .FirstOrDefaultAsync(im => im.Id == invoiceId && im.TenantId == tenantId);

                if (invoice == null)
                    return NotFound(new { error = "Invoice not found" });

                var invoiceDetails = await _context.InvoiceDetail
                    .Where(id => id.InvoiceId == invoiceId)
                    .OrderBy(id => id.Id)
                    .ToListAsync();

                // Get OrderId from invoice details
                var orderId = invoiceDetails.FirstOrDefault()?.OrderId ?? 0;

                var order = await _context.CustomerOrder
                    .FirstOrDefaultAsync(o => o.OrderID == orderId && o.Tenantid == tenantId);

                if (order == null)
                    return NotFound(new { error = "Customer order not found" });

                var customer = await _context.CustomerMaster
                    .FirstOrDefaultAsync(c => c.customer_id == order.CustomerID && c.Tenantid == tenantId);

                // Get company info from Location or EntityMaster (fallback)
                var companyInfo = await GetCompanyInfo(tenantId, locationId);

                // Join invoice details with order details to get full information
                var lineItems = invoiceDetails
                    .Join(_context.CustomerOrderDetails,
                        id => id.OrderDetailID,
                        cod => cod.ID,
                        (id, cod) => new { InvoiceDetail = id, OrderDetail = cod })
                    .OrderBy(x => x.OrderDetail.ItemNo)
                    .Select(x => new PdfLineItem
                    {
                        PartNo = x.OrderDetail.PartNo ?? "",
                        PartDescription = x.InvoiceDetail.Description ?? x.OrderDetail.partname ?? "",
                        Date = FormatDate(x.OrderDetail.DueDate),
                        Unit = x.OrderDetail.Unit ?? "EA",
                        Qty = x.InvoiceDetail.QtyInvoiced,
                        UnitPrice = x.InvoiceDetail.price,
                        DiscountAmount = (x.InvoiceDetail.QtyInvoiced * x.InvoiceDetail.price) * (x.InvoiceDetail.discount / 100),
                        Amount = x.InvoiceDetail.Amount,
                        Notes = x.OrderDetail.notes ?? ""
                    })
                    .ToList();

                // Build PDF data
                var pdfData = new PdfDocumentData
                {
                    CompanyName = companyInfo.CompanyName,
                    CompanyAddress = companyInfo.CompanyAddress,
                    CompanyCityStateZip = companyInfo.CompanyCityStateZip,
                    CompanyEmail = companyInfo.CompanyEmail,
                    CompanyPhone = companyInfo.CompanyPhone,
                    CompanyWebAddress = companyInfo.CompanyWebAddress,
                    LogoPath = companyInfo.LogoPath,
                    CustomerName = order.CustomerName ?? "",
                    BillingAddress = BuildBillingAddress(customer),
                    ShippingAddress = BuildShippingAddress(customer),
                    BuyerName = order?.BuyerName ?? "",
                    PhoneNumber = customer?.phone_number ?? "",
                    LineItems = lineItems,
                    TotalAmount = invoice.TotalAmount
                };

                var invoiceNumber = invoice.PrefixInvoiceNo ?? $"INV-{invoice.InvoiceNo}";
                var orderNumber = order != null 
                    ? (order.PONumber < 1000 ? $"CO#{order.PONumber + 999}" : $"CO#{order.PONumber}")
                    : "";

                var pdfBytes = _pdfService.GenerateInvoicePdf(
                    pdfData,
                    invoiceNumber,
                    FormatDate(invoice.InvoiceDate),
                    FormatDate(invoice.DueDate),
                    orderNumber,
                    invoice.Amount,
                    invoice.SaleTaxAmount,
                    invoice.ShippingCharge
                );

                return File(pdfBytes, "application/pdf", $"Invoice_{invoiceNumber}_{DateTime.Now:yyyy-MM-dd}.pdf");
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GenerateVendorInvoice")]
        public async Task<IActionResult> GenerateVendorInvoice([FromQuery] int invoiceId, [FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            try
            {
                var invoice = await _context.VendorInvoiceMaster
                    .FirstOrDefaultAsync(vim => vim.Id == invoiceId && vim.TenantId == tenantId);

                if (invoice == null)
                    return NotFound(new { error = "Vendor invoice not found" });

                var invoiceDetails = await _context.VendorInvoiceDetail
                    .Where(vid => vid.InvoiceId == invoiceId)
                    .OrderBy(vid => vid.Id)
                    .ToListAsync();

                var vendor = await _context.VendorMaster
                    .FirstOrDefaultAsync(v => v.vendor_id == invoice.vid && v.Tenantid == tenantId);

                // Get company info from Location or EntityMaster (fallback)
                var companyInfo = await GetCompanyInfo(tenantId, locationId);

                // Build PDF data
                var pdfData = new PdfDocumentData
                {
                    CompanyName = companyInfo.CompanyName,
                    CompanyAddress = companyInfo.CompanyAddress,
                    CompanyCityStateZip = companyInfo.CompanyCityStateZip,
                    CompanyEmail = companyInfo.CompanyEmail,
                    CompanyPhone = companyInfo.CompanyPhone,
                    CompanyWebAddress = companyInfo.CompanyWebAddress,
                    LogoPath = companyInfo.LogoPath,
                    CustomerName = invoice.VendorName ?? "", // Using CustomerName field for vendor name
                    BillingAddress = BuildVendorBillingAddress(vendor),
                    ShippingAddress = BuildVendorShippingAddress(vendor),
                    BuyerName = "",
                    PhoneNumber = vendor?.phone_number ?? "",
                    LineItems = invoiceDetails.Select(d => new PdfLineItem
                    {
                        PartNo = "",
                        PartDescription = d.Description ?? "",
                        Date = "",
                        Unit = "",
                        Qty = d.qty ?? 0,
                        UnitPrice = d.price ?? 0,
                        DiscountAmount = 0,
                        Amount = d.Amount,
                        Notes = ""
                    }).ToList(),
                    TotalAmount = invoice.TotalAmount
                };

                var invoiceNumber = invoice.prefixinvoiceno ?? $"VINV-{invoice.InvoiceNo}";
                var vendorPoNumber = "";

                // Try to get vendor order PO number if linked
                if (invoiceDetails.Any() && invoiceDetails.First().OrderId > 0)
                {
                    var vendorOrder = await _context.VendorOrders
                        .FirstOrDefaultAsync(vo => vo.OrderID == invoiceDetails.First().OrderId && vo.Tenantid == tenantId);
                    if (vendorOrder != null)
                    {
                        vendorPoNumber = vendorOrder.PONumber < 1000 
                            ? $"VO#{vendorOrder.PONumber + 999}" 
                            : $"VO#{vendorOrder.PONumber}";
                    }
                }

                // Calculate tax amount if available (TotalAmount - Amount)
                var taxAmount = invoice.TotalAmount > invoice.Amount ? invoice.TotalAmount - invoice.Amount : (decimal?)null;

                var pdfBytes = _pdfService.GenerateVendorInvoicePdf(
                    pdfData,
                    invoiceNumber,
                    FormatDate(invoice.InvoiceDate),
                    FormatDate(invoice.DueDate),
                    vendorPoNumber,
                    invoice.Amount,
                    invoice.PaymentMethod ?? "",
                    taxAmount
                );

                return File(pdfBytes, "application/pdf", $"VendorInvoice_{invoiceNumber}_{DateTime.Now:yyyy-MM-dd}.pdf");
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GenerateVendorOrder")]
        public async Task<IActionResult> GenerateVendorOrder([FromQuery] int orderId, [FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            try
            {
                var order = await _context.VendorOrders
                    .FirstOrDefaultAsync(vo => vo.OrderID == orderId && vo.Tenantid == tenantId);

                if (order == null)
                    return NotFound(new { error = "Vendor order not found" });

                var orderDetails = await _context.VendorOrderDetails
                    .Where(vod => vod.OrderID == orderId && vod.Tenantid == tenantId)
                    .OrderBy(vod => vod.ItemNo)
                    .ToListAsync();

                var vendor = await _context.VendorMaster
                    .FirstOrDefaultAsync(v => v.vendor_id == order.VendorID && v.Tenantid == tenantId);

                // Get company info from Location or EntityMaster (fallback)
                var companyInfo = await GetCompanyInfo(tenantId, locationId);

                // Build PDF data
                var pdfData = new PdfDocumentData
                {
                    CompanyName = companyInfo.CompanyName,
                    CompanyAddress = companyInfo.CompanyAddress,
                    CompanyCityStateZip = companyInfo.CompanyCityStateZip,
                    CompanyEmail = companyInfo.CompanyEmail,
                    CompanyPhone = companyInfo.CompanyPhone,
                    CompanyWebAddress = companyInfo.CompanyWebAddress,
                    LogoPath = companyInfo.LogoPath,
                    CustomerName = order.VendorName ?? "", // Using CustomerName field for vendor name
                    BillingAddress = BuildVendorBillingAddress(vendor),
                    ShippingAddress = BuildVendorShippingAddress(vendor),
                    BuyerName = order.BuyerName ?? "",
                    PhoneNumber = vendor?.phone_number ?? "",
                    LineItems = orderDetails.Select(d => new PdfLineItem
                    {
                        PartNo = d.PartNo ?? "",
                        PartDescription = FormatVendorOrderLineDescription(d.LineType, d.PartName),
                        Date = FormatDate(d.DueDateDateTime),
                        Unit = d.Unit ?? "EA",
                        Qty = d.QtyOrdered,
                        UnitPrice = d.UnitPrice,
                        DiscountAmount = CalculateDiscountAmount(d.QtyOrdered * d.UnitPrice, d.Discount, d.DiscountType),
                        Amount = (d.QtyOrdered * d.UnitPrice) - CalculateDiscountAmount(d.QtyOrdered * d.UnitPrice, d.Discount, d.DiscountType),
                        Notes = d.Notes ?? ""
                    }).ToList(),
                    TotalAmount = order.TotalAmount
                };

                var orderNumber = order.PONumber < 1000 
                    ? $"VO#{order.PONumber + 999}" 
                    : $"VO#{order.PONumber}";

                var pdfBytes = _pdfService.GenerateVendorOrderPdf(
                    pdfData,
                    orderNumber,
                    FormatDate(order.OrderDate),
                    order.VendorPoNumber ?? "",
                    order.ShippingInstructions ?? ""
                );

                return File(pdfBytes, "application/pdf", $"VendorOrder_{orderNumber}_{DateTime.Now:yyyy-MM-dd}.pdf");
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GenerateVendorQuotation")]
        public async Task<IActionResult> GenerateVendorQuotation([FromQuery] int quotationId, [FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            try
            {
                var quotation = await _context.VendorQuotations
                    .FirstOrDefaultAsync(vq => vq.OrderID == quotationId && vq.Tenantid == tenantId);

                if (quotation == null)
                    return NotFound(new { error = "Vendor quotation not found" });

                var quotationDetails = await _context.VendorQuotationsDetails
                    .Where(vqd => vqd.OrderID == quotationId && vqd.Tenantid == tenantId)
                    .OrderBy(vqd => vqd.ItemNo)
                    .ToListAsync();

                var vendor = await _context.VendorMaster
                    .FirstOrDefaultAsync(v => v.vendor_id == quotation.VendorID && v.Tenantid == tenantId);

                // Get company info from Location or EntityMaster (fallback)
                var companyInfo = await GetCompanyInfo(tenantId, locationId);

                // Build PDF data
                var pdfData = new PdfDocumentData
                {
                    CompanyName = companyInfo.CompanyName,
                    CompanyAddress = companyInfo.CompanyAddress,
                    CompanyCityStateZip = companyInfo.CompanyCityStateZip,
                    CompanyEmail = companyInfo.CompanyEmail,
                    CompanyPhone = companyInfo.CompanyPhone,
                    CompanyWebAddress = companyInfo.CompanyWebAddress,
                    LogoPath = companyInfo.LogoPath,
                    CustomerName = quotation.VendorName ?? "", // Using CustomerName field for vendor name
                    BillingAddress = BuildVendorBillingAddress(vendor),
                    ShippingAddress = BuildVendorShippingAddress(vendor),
                    BuyerName = quotation.contactName ?? "",
                    PhoneNumber = vendor?.phone_number ?? "",
                    LineItems = quotationDetails.Select(d => new PdfLineItem
                    {
                        PartNo = d.PartNo ?? "",
                        PartDescription = d.itemname ?? "",
                        Date = FormatDate(d.DueDate),
                        Unit = d.Unit ?? "EA",
                        Qty = d.QtyOrdered,
                        UnitPrice = d.UnitPrice,
                        DiscountAmount = CalculateDiscountAmount(d.QtyOrdered * d.UnitPrice, d.Discount, d.DiscountType),
                        Amount = (d.QtyOrdered * d.UnitPrice) - CalculateDiscountAmount(d.QtyOrdered * d.UnitPrice, d.Discount, d.DiscountType),
                        Notes = d.notes ?? ""
                    }).ToList(),
                    TotalAmount = quotation.TotalAmount
                };

                var quotationNumber = quotation.PONumber < 1000 
                    ? $"VQ#{quotation.PONumber + 999}" 
                    : $"VQ#{quotation.PONumber}";

                var pdfBytes = _pdfService.GenerateVendorQuotationPdf(
                    pdfData,
                    quotationNumber,
                    FormatDate(quotation.OrderDate),
                    quotation.VendorPoNumber ?? "",
                    quotation.VendorOrderType ?? "Material"
                );

                return File(pdfBytes, "application/pdf", $"VendorQuotation_{quotationNumber}_{DateTime.Now:yyyy-MM-dd}.pdf");
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GenerateShipment")]
        public async Task<IActionResult> GenerateShipment([FromQuery] int shipmentId, [FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            try
            {
                var shipment = await _context.Shipping
                    .FirstOrDefaultAsync(s => s.Id == shipmentId && s.TenantId == tenantId);

                if (shipment == null)
                    return NotFound(new { error = "Shipment not found" });

                var shipmentDetails = await _context.ShippingDetails
                    .Where(sd => sd.ShipmentId == shipmentId)
                    .Join(_context.CustomerOrderDetails,
                        sd => sd.OrderDetailID,
                        cod => cod.ID,
                        (sd, cod) => new { sd, cod })
                    .OrderBy(x => x.cod.ItemNo)
                    .ToListAsync();

                var order = await _context.CustomerOrder
                    .FirstOrDefaultAsync(o => o.OrderID == shipment.OrderId && o.Tenantid == tenantId);

                var customer = await _context.CustomerMaster
                    .FirstOrDefaultAsync(c => c.customer_id == order.CustomerID && c.Tenantid == tenantId);

                // Get company info from Location or EntityMaster (fallback)
                var companyInfo = await GetCompanyInfo(tenantId, locationId);

                // Build PDF data
                var pdfData = new PdfDocumentData
                {
                    CompanyName = companyInfo.CompanyName,
                    CompanyAddress = companyInfo.CompanyAddress,
                    CompanyCityStateZip = companyInfo.CompanyCityStateZip,
                    CompanyEmail = companyInfo.CompanyEmail,
                    CompanyPhone = companyInfo.CompanyPhone,
                    CompanyWebAddress = companyInfo.CompanyWebAddress,
                    LogoPath = companyInfo.LogoPath,
                    CustomerName = order?.CustomerName ?? "",
                    BillingAddress = BuildBillingAddress(customer),
                    ShippingAddress = BuildShippingAddress(customer),
                    BuyerName = order?.BuyerName ?? "",
                    PhoneNumber = customer?.phone_number ?? "",
                    LineItems = shipmentDetails.Select(x => new PdfLineItem
                    {
                        PartNo = x.cod.PartNo ?? "",
                        PartDescription = x.cod.partname ?? "",
                        Date = "",
                        Unit = x.cod.Unit ?? "EA",
                        Qty = x.sd.ShippedQty,
                        UnitPrice = 0,
                        DiscountAmount = 0,
                        Amount = 0,
                        Notes = ""
                    }).ToList(),
                    TotalAmount = 0
                };

                var shipmentNumber = shipment.ShipmentNo ?? $"SHIP-{shipment.Id}";
                var orderNumber = order != null
                    ? (order.PONumber < 1000 ? $"CO#{order.PONumber + 999}" : $"CO#{order.PONumber}")
                    : "";

                var pdfBytes = _pdfService.GenerateShipmentPdf(
                    pdfData,
                    shipmentNumber,
                    FormatDate(shipment.ShipmentDate),
                    shipment.CourierTrackingNo ?? "",
                    shipment.ShipVia ?? "",
                    orderNumber
                );

                return File(pdfBytes, "application/pdf", $"Shipment_{shipmentNumber}_{DateTime.Now:yyyy-MM-dd}.pdf");
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GenerateJobOrder")]
        public async Task<IActionResult> GenerateJobOrder([FromQuery] int jobOrderId, [FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            try
            {
                var jobOrder = await _context.JobOrderMaster
                    .FirstOrDefaultAsync(jo => jo.JobOrderID == jobOrderId && jo.Tenantid == tenantId);

                if (jobOrder == null)
                    return NotFound(new { error = "Job order not found" });

                var customer = await _context.CustomerMaster
                    .FirstOrDefaultAsync(c => c.customer_id == jobOrder.CustomerID && c.Tenantid == tenantId);

                var order = await _context.CustomerOrder
                    .FirstOrDefaultAsync(o => o.OrderID == jobOrder.CustomerOrderID && o.Tenantid == tenantId);

                // Get company info from Location or EntityMaster (fallback)
                var companyInfo = await GetCompanyInfo(tenantId, locationId);

                // Deserialize routing steps
                List<PdfRoutingStep> routingSteps = new List<PdfRoutingStep>();
                if (!string.IsNullOrEmpty(jobOrder.RoutingStepsJson))
                {
                    try
                    {
                        using var doc = JsonDocument.Parse(jobOrder.RoutingStepsJson);
                        if (doc.RootElement.ValueKind == JsonValueKind.Array)
                        {
                            routingSteps = doc.RootElement.EnumerateArray()
                                .Select(step =>
                                {
                                    var stepId = step.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.Number
                                        ? idEl.GetInt32()
                                        : (int?)null;
                                    var scanCode = step.TryGetProperty("scanCode", out var sc) && sc.ValueKind == JsonValueKind.String
                                        ? sc.GetString() ?? ""
                                        : "";
                                    if (string.IsNullOrWhiteSpace(scanCode) && stepId.HasValue && stepId.Value > 0)
                                        scanCode = QrCodeHelper.BuildStepScanCode(jobOrderId, stepId.Value);

                                    return new PdfRoutingStep
                                    {
                                        Sequence = step.TryGetProperty("sequence", out var seq) && seq.ValueKind == JsonValueKind.Number ? seq.GetInt32() : 0,
                                        ProcessName = step.TryGetProperty("processName", out var pn) ? pn.GetString() ?? "" : "",
                                        Description = step.TryGetProperty("description", out var desc) ? desc.GetString() ?? "" : "",
                                        WorkstationName = step.TryGetProperty("workstationName", out var ws) ? ws.GetString() ?? "" : "",
                                        TechnicianName = step.TryGetProperty("technicianName", out var tech) ? tech.GetString() ?? "" : "",
                                        EstimatedTime = step.TryGetProperty("estimatedTime", out var et) && et.ValueKind == JsonValueKind.Number ? et.GetInt32() : null,
                                        Status = step.TryGetProperty("status", out var status) ? status.GetString() ?? "" : "",
                                        ScanCode = scanCode,
                                        QrPng = QrCodeHelper.GeneratePng(scanCode)
                                    };
                                })
                                .OrderBy(rs => rs.Sequence)
                                .ToList();
                        }
                    }
                    catch
                    {
                        // If deserialization fails, leave routingSteps empty
                    }
                }

                // Build PDF data
                var pdfData = new PdfDocumentData
                {
                    CompanyName = companyInfo.CompanyName,
                    CompanyAddress = companyInfo.CompanyAddress,
                    CompanyCityStateZip = companyInfo.CompanyCityStateZip,
                    CompanyEmail = companyInfo.CompanyEmail,
                    CompanyPhone = companyInfo.CompanyPhone,
                    CompanyWebAddress = companyInfo.CompanyWebAddress,
                    LogoPath = companyInfo.LogoPath,
                    CustomerName = jobOrder.CustomerName ?? "",
                    BillingAddress = BuildBillingAddress(customer),
                    ShippingAddress = BuildShippingAddress(customer),
                    BuyerName = order?.BuyerName ?? "",
                    PhoneNumber = customer?.phone_number ?? "",
                    LineItems = new List<PdfLineItem>(),
                    TotalAmount = jobOrder.QtyOrdered * jobOrder.UnitPrice,
                    RoutingSteps = routingSteps,
                    RoutingTemplateCode = jobOrder.JobTemplateCode ?? "",
                    RoutingTemplateRevision = jobOrder.JobTemplateRevision
                };

                var jobOrderNumber = jobOrder.JobOrderNumber < 1000 
                    ? $"JO#{jobOrder.JobOrderNumber + 999}" 
                    : $"JO#{jobOrder.JobOrderNumber}";
                
                var customerOrderNumber = order != null
                    ? (order.PONumber < 1000 ? $"CO#{order.PONumber + 999}" : $"CO#{order.PONumber}")
                    : "";

                var customerOrderDate = order != null ? FormatDate(order.OrderDate) : "";
                var customerRefNo = order != null 
                    ? (!string.IsNullOrEmpty(order.QuotationNo) ? order.QuotationNo : order.CustomerPoNumber ?? "")
                    : "";

                var pdfBytes = _pdfService.GenerateJobOrderPdf(
                    pdfData,
                    jobOrderNumber,
                    FormatDate(jobOrder.OrderDate),
                    jobOrder.JobNumber ?? "",
                    jobOrder.JobDesc ?? "",
                    jobOrder.DrawingNumber ?? "",
                    jobOrder.DrawingRevision ?? "",
                    customerOrderNumber,
                    customerOrderDate,
                    customerRefNo,
                    jobOrder.PartNo ?? "",
                    jobOrder.PartName ?? "",
                    jobOrder.QtyOrdered,
                    jobOrder.Unit ?? "EA",
                    jobOrder.UnitPrice,
                    jobOrder.JobPriority,
                    FormatDate(jobOrder.DueDate),
                    jobOrder.Status ?? "Draft"
                );

                return File(pdfBytes, "application/pdf", $"JobOrder_{jobOrderNumber}_{DateTime.Now:yyyy-MM-dd}.pdf");
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        private List<string> BuildVendorBillingAddress(Data.Models.VendorMaster? vendor)
        {
            var address = new List<string>();
            if (vendor == null) return address;

            if (!string.IsNullOrEmpty(vendor.address))
                address.Add(vendor.address);
            if (!string.IsNullOrEmpty(vendor.apartment))
                address.Add(vendor.apartment);
            
            var cityStateZip = new List<string>();
            if (!string.IsNullOrEmpty(vendor.city)) cityStateZip.Add(vendor.city);
            if (!string.IsNullOrEmpty(vendor.state)) cityStateZip.Add(vendor.state);
            if (!string.IsNullOrEmpty(vendor.zip)) cityStateZip.Add(vendor.zip);
            if (cityStateZip.Any())
                address.Add(string.Join(", ", cityStateZip));
            if (!string.IsNullOrEmpty(vendor.country))
                address.Add(vendor.country);

            return address;
        }

        private List<string> BuildVendorShippingAddress(Data.Models.VendorMaster? vendor)
        {
            var address = new List<string>();
            if (vendor == null) return address;

            if (!string.IsNullOrEmpty(vendor.shippingAddress))
                address.Add(vendor.shippingAddress);
            if (!string.IsNullOrEmpty(vendor.shippingApartment))
                address.Add(vendor.shippingApartment);
            
            var cityStateZip = new List<string>();
            if (!string.IsNullOrEmpty(vendor.shippingCity)) cityStateZip.Add(vendor.shippingCity);
            if (!string.IsNullOrEmpty(vendor.shippingStates)) cityStateZip.Add(vendor.shippingStates);
            if (!string.IsNullOrEmpty(vendor.shippingZipCode)) cityStateZip.Add(vendor.shippingZipCode);
            if (cityStateZip.Any())
                address.Add(string.Join(", ", cityStateZip));
            if (!string.IsNullOrEmpty(vendor.shippingCountry))
                address.Add(vendor.shippingCountry);

            return address;
        }

        private async Task<(string CompanyName, string CompanyAddress, string CompanyCityStateZip, string CompanyEmail, string CompanyPhone, string CompanyWebAddress, string LogoPath)> GetCompanyInfo(int tenantId, int? locationId)
        {
            // Try to get location data first if locationId is provided
            if (locationId.HasValue && locationId.Value > 0)
            {
                var location = await _context.Locations
                    .FirstOrDefaultAsync(l => l.LocationId == locationId.Value && l.TenantId == tenantId);

                if (location != null)
                {
                    // Get logo if available
                    var logo = await _context.LogoAttachment
                        .Where(la => la.locationId == locationId.Value && la.TenantID == tenantId)
                        .OrderByDescending(la => la.Id)
                        .FirstOrDefaultAsync();

                    var logoPath = "";
                    if (logo != null && !string.IsNullOrEmpty(logo.UploadFile))
                    {
                        // Resolve logo path to full file system path
                        var webRootPath = _environment.WebRootPath ?? Path.Combine(_environment.ContentRootPath, "wwwroot");
                        
                        // Remove leading slash if present
                        var cleanUploadFile = logo.UploadFile.TrimStart('/', '\\');
                        var fullLogoPath = Path.Combine(webRootPath, cleanUploadFile.Replace('/', Path.DirectorySeparatorChar));
                        
                        // Check if file exists
                        if (System.IO.File.Exists(fullLogoPath))
                        {
                            logoPath = fullLogoPath;
                        }
                        else
                        {
                            // Try alternative path resolution
                            var altPath = Path.Combine(_environment.ContentRootPath, "wwwroot", cleanUploadFile.Replace('/', Path.DirectorySeparatorChar));
                            if (System.IO.File.Exists(altPath))
                            {
                                logoPath = altPath;
                            }
                        }
                    }

                    var cityStateZip = new List<string>();
                    if (!string.IsNullOrEmpty(location.city)) cityStateZip.Add(location.city);
                    if (!string.IsNullOrEmpty(location.state)) cityStateZip.Add(location.state);
                    if (!string.IsNullOrEmpty(location.zip)) cityStateZip.Add(location.zip);

                    return (
                        CompanyName: location.Name ?? "Your Company Name",
                        CompanyAddress: location.Address ?? "",
                        CompanyCityStateZip: string.Join(", ", cityStateZip),
                        CompanyEmail: location.email ?? "",
                        CompanyPhone: location.phone ?? "",
                        CompanyWebAddress: location.webaddress ?? "",
                        LogoPath: logoPath
                    );
                }
            }

            // Fallback to EntityMaster
            var entity = await _context.EntityMaster
                .FirstOrDefaultAsync(e => e.Tenantid == tenantId);

            if (entity != null)
            {
                var cityStateZip = new List<string>();
                if (!string.IsNullOrEmpty(entity.city)) cityStateZip.Add(entity.city);
                if (!string.IsNullOrEmpty(entity.state)) cityStateZip.Add(entity.state);
                if (!string.IsNullOrEmpty(entity.zip)) cityStateZip.Add(entity.zip);

                return (
                    CompanyName: entity.company_name ?? "Your Company Name",
                    CompanyAddress: entity.address ?? "",
                    CompanyCityStateZip: string.Join(", ", cityStateZip),
                    CompanyEmail: entity.email ?? "",
                    CompanyPhone: entity.phone_number ?? "",
                    CompanyWebAddress: entity.WebAddress ?? "",
                    LogoPath: ""
                );
            }

            // Default values if nothing found
            return (
                CompanyName: "Your Company Name",
                CompanyAddress: "",
                CompanyCityStateZip: "",
                CompanyEmail: "",
                CompanyPhone: "",
                CompanyWebAddress: "",
                LogoPath: ""
            );
        }

        private string BuildCompanyCityStateZip(Data.Models.EntityMaster? entity)
        {
            if (entity == null) return "";
            
            var parts = new List<string>();
            if (!string.IsNullOrEmpty(entity.city)) parts.Add(entity.city);
            if (!string.IsNullOrEmpty(entity.state)) parts.Add(entity.state);
            if (!string.IsNullOrEmpty(entity.zip)) parts.Add(entity.zip);
            
            return string.Join(", ", parts);
        }

        private static decimal CalculateDiscountAmount(decimal subtotal, decimal discount, string? discountType)
        {
            if (discount <= 0) return 0;
            if (string.Equals(discountType, "Amount", StringComparison.OrdinalIgnoreCase))
            {
                return Math.Min(discount, subtotal);
            }
            return subtotal * (discount / 100m);
        }

        private static List<PdfQtyPriceOption> BuildPrintQtyOptions(
            string? quantityTiersJson,
            decimal discount,
            string? discountType)
        {
            var options = new List<PdfQtyPriceOption>();
            if (string.IsNullOrWhiteSpace(quantityTiersJson))
            {
                return options;
            }

            try
            {
                using var doc = JsonDocument.Parse(quantityTiersJson);
                var root = doc.RootElement;
                if (root.ValueKind != JsonValueKind.Object)
                {
                    return options;
                }

                if (!TryGetPropertyIgnoreCase(root, "quantities", out var quantitiesElem) ||
                    quantitiesElem.ValueKind != JsonValueKind.Array)
                {
                    return options;
                }

                var quantities = quantitiesElem.EnumerateArray()
                    .Select(e => e.TryGetInt32(out var q) ? q : 0)
                    .ToList();

                var includeFlags = new List<bool>();
                if (TryGetPropertyIgnoreCase(root, "includeInPrint", out var includeElem) &&
                    includeElem.ValueKind == JsonValueKind.Array)
                {
                    includeFlags = includeElem.EnumerateArray()
                        .Select(e => e.ValueKind == JsonValueKind.True ||
                                     (e.ValueKind == JsonValueKind.False ? false :
                                      e.ValueKind == JsonValueKind.Number && e.GetInt32() != 0))
                        .ToList();
                }

                var unitPrices = new decimal[quantities.Count];
                if (TryGetPropertyIgnoreCase(root, "breakdownPrices", out var breakdownElem) &&
                    breakdownElem.ValueKind == JsonValueKind.Array)
                {
                    foreach (var bp in breakdownElem.EnumerateArray())
                    {
                        if (!TryGetPropertyIgnoreCase(bp, "prices", out var pricesElem) ||
                            pricesElem.ValueKind != JsonValueKind.Array)
                        {
                            continue;
                        }

                        var prices = pricesElem.EnumerateArray()
                            .Select(p => p.TryGetDecimal(out var val) ? val : 0m)
                            .ToList();

                        for (int i = 0; i < quantities.Count && i < prices.Count; i++)
                        {
                            unitPrices[i] += prices[i];
                        }
                    }
                }

                for (int i = 0; i < quantities.Count; i++)
                {
                    var include = i < includeFlags.Count ? includeFlags[i] : false;
                    if (!include || quantities[i] <= 0)
                    {
                        continue;
                    }

                    var qty = quantities[i];
                    var unitPrice = unitPrices[i];
                    var subtotal = qty * unitPrice;
                    var discountAmount = CalculateDiscountAmount(subtotal, discount, discountType);
                    options.Add(new PdfQtyPriceOption
                    {
                        Qty = qty,
                        UnitPrice = unitPrice,
                        DiscountAmount = discountAmount,
                        Amount = Math.Max(0, subtotal - discountAmount)
                    });
                }
            }
            catch
            {
                // Ignore malformed matrix JSON
            }

            return options;
        }

        private static bool TryGetPropertyIgnoreCase(JsonElement element, string name, out JsonElement value)
        {
            foreach (var prop in element.EnumerateObject())
            {
                if (string.Equals(prop.Name, name, StringComparison.OrdinalIgnoreCase))
                {
                    value = prop.Value;
                    return true;
                }
            }

            value = default;
            return false;
        }

        private string FormatDate(DateTime? date)
        {
            return date?.ToString("MM/dd/yyyy") ?? "";
        }

        private static string FormatVendorOrderLineDescription(string? lineType, string? partName)
        {
            var name = partName ?? "";
            var label = lineType switch
            {
                "RawMaterial" => "RM",
                "FinishedProduct" => "FP",
                "Tool" => "Tool",
                "Service" => "Svc",
                "Subcontract" => "Sub",
                "Other" => "Other",
                _ => ""
            };
            if (string.IsNullOrEmpty(label))
                return name;
            return string.IsNullOrEmpty(name) ? $"[{label}]" : $"[{label}] {name}";
        }
    }
}

