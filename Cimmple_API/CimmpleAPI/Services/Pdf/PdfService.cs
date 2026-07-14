using QuestPDF.Infrastructure;
using QuestPDF.Fluent;
using System.IO;
using CimmpleAPI.Services.Pdf.Models;
using CimmpleAPI.Services.Pdf.Templates;

namespace CimmpleAPI.Services.Pdf
{
    public class PdfService
    {
        public byte[] GenerateQuotationPdf(PdfDocumentData data, string quotationNumber, string quotationDate, string customerRefNo)
        {
            QuestPDF.Settings.License = LicenseType.Community;
            QuestPDF.Settings.EnableDebugging = true;

            var template = new QuotationTemplate(data, quotationNumber, quotationDate, customerRefNo);
            var document = template.Compose();

            using var stream = new MemoryStream();
            document.GeneratePdf(stream);
            return stream.ToArray();
        }

        public byte[] GenerateOrderPdf(PdfDocumentData data, string orderNumber, string orderDate, string quotationNo)
        {
            QuestPDF.Settings.License = LicenseType.Community;
            QuestPDF.Settings.EnableDebugging = true;

            var template = new OrderTemplate(data, orderNumber, orderDate, quotationNo);
            var document = template.Compose();

            using var stream = new MemoryStream();
            document.GeneratePdf(stream);
            return stream.ToArray();
        }

        public byte[] GenerateInvoicePdf(PdfDocumentData data, string invoiceNumber, string invoiceDate, string dueDate, string orderNumber, decimal subtotal, decimal? taxAmount = null, decimal? shippingCharge = null)
        {
            QuestPDF.Settings.License = LicenseType.Community;
            QuestPDF.Settings.EnableDebugging = true;

            var template = new InvoiceTemplate(data, invoiceNumber, invoiceDate, dueDate, orderNumber, subtotal, taxAmount, shippingCharge);
            var document = template.Compose();

            using var stream = new MemoryStream();
            document.GeneratePdf(stream);
            return stream.ToArray();
        }

        public byte[] GenerateVendorInvoicePdf(PdfDocumentData data, string invoiceNumber, string invoiceDate, string dueDate, string vendorPoNumber, decimal subtotal, string paymentMethod = "", decimal? taxAmount = null)
        {
            QuestPDF.Settings.License = LicenseType.Community;
            QuestPDF.Settings.EnableDebugging = true;

            var template = new VendorInvoiceTemplate(data, invoiceNumber, invoiceDate, dueDate, vendorPoNumber, subtotal, paymentMethod, taxAmount);
            var document = template.Compose();

            using var stream = new MemoryStream();
            document.GeneratePdf(stream);
            return stream.ToArray();
        }

        public byte[] GenerateVendorOrderPdf(PdfDocumentData data, string orderNumber, string orderDate, string vendorPoNumber, string shippingInstructions = "")
        {
            QuestPDF.Settings.License = LicenseType.Community;
            QuestPDF.Settings.EnableDebugging = true;

            var template = new VendorOrderTemplate(data, orderNumber, orderDate, vendorPoNumber, shippingInstructions);
            var document = template.Compose();

            using var stream = new MemoryStream();
            document.GeneratePdf(stream);
            return stream.ToArray();
        }

        public byte[] GenerateVendorQuotationPdf(PdfDocumentData data, string quotationNumber, string quotationDate, string vendorRefNo = "", string quotationType = "Material")
        {
            QuestPDF.Settings.License = LicenseType.Community;
            QuestPDF.Settings.EnableDebugging = true;

            var template = new VendorQuotationTemplate(data, quotationNumber, quotationDate, vendorRefNo, quotationType);
            var document = template.Compose();

            using var stream = new MemoryStream();
            document.GeneratePdf(stream);
            return stream.ToArray();
        }

        public byte[] GenerateShipmentPdf(PdfDocumentData data, string shipmentNumber, string shipmentDate, string trackingNumber = "", string carrier = "", string orderNumber = "")
        {
            QuestPDF.Settings.License = LicenseType.Community;
            QuestPDF.Settings.EnableDebugging = true;

            var template = new ShipmentTemplate(data, shipmentNumber, shipmentDate, trackingNumber, carrier, orderNumber);
            var document = template.Compose();

            using var stream = new MemoryStream();
            document.GeneratePdf(stream);
            return stream.ToArray();
        }

        public byte[] GenerateJobOrderPdf(PdfDocumentData data, string jobOrderNumber, string jobOrderDate, 
            string jobNumber, string jobDesc, string drawingNumber, string drawingRevision, 
            string customerOrderNumber, string customerOrderDate, string customerRefNo,
            string partNo, string partName, int qtyOrdered, string unit, decimal unitPrice,
            int jobPriority, string dueDate, string status)
        {
            QuestPDF.Settings.License = LicenseType.Community;
            QuestPDF.Settings.EnableDebugging = true;

            var template = new JobOrderTemplate(data, jobOrderNumber, jobOrderDate, jobNumber, jobDesc, 
                drawingNumber, drawingRevision, customerOrderNumber, customerOrderDate, customerRefNo,
                partNo, partName, qtyOrdered, unit, unitPrice, jobPriority, dueDate, status);
            var document = template.Compose();

            using var stream = new MemoryStream();
            document.GeneratePdf(stream);
            return stream.ToArray();
        }
    }
}

