using QuestPDF.Fluent;
using QuestPDF.Infrastructure;
using CimmpleAPI.Services.Pdf.Models;

namespace CimmpleAPI.Services.Pdf.Templates
{
    public class VendorInvoiceTemplate : BaseDocumentTemplate
    {
        private readonly string InvoiceNumber;
        private readonly string InvoiceDate;
        private readonly string DueDate;
        private readonly string VendorPoNumber;
        private readonly string PaymentMethod;
        private readonly decimal? TaxAmount;
        private readonly decimal Subtotal;

        public VendorInvoiceTemplate(PdfDocumentData data, string invoiceNumber, string invoiceDate, string dueDate, string vendorPoNumber, decimal subtotal, string paymentMethod = "", decimal? taxAmount = null) 
            : base(data)
        {
            InvoiceNumber = invoiceNumber;
            InvoiceDate = invoiceDate;
            DueDate = dueDate;
            VendorPoNumber = vendorPoNumber;
            Subtotal = subtotal;
            PaymentMethod = paymentMethod;
            TaxAmount = taxAmount;
        }

        public override Document Compose()
        {
            var headerDetails = new List<string>
            {
                $"Invoice No.: {InvoiceNumber}",
                $"Invoice Date: {InvoiceDate}",
                $"Due Date: {DueDate}"
            };
            
            if (!string.IsNullOrEmpty(VendorPoNumber))
            {
                headerDetails.Add($"PO No.: {VendorPoNumber}");
            }

            return Document.Create(container =>
            {
                container.Page(page =>
                {
                    page.Size(QuestPDF.Helpers.PageSizes.A4);
                    page.Margin(10, Unit.Millimetre);

                    page.Header().Element(header => ComposeHeader(header, "VENDOR INVOICE", headerDetails.ToArray()));
                    
                    page.Content().Column(column =>
                    {
                        column.Spacing(12);
                        column.Item().Element(ComposeAddressSection);

                        column.Item().Element(container => container
                            .PaddingTop(12)
                            .Table(table =>
                            {
                                ComposeTableContent(table, DocumentData.LineItems,
                                    new[] { "Description", "Qty", "Unit Price", "Amount", "Notes" });
                            }));

                        column.Item().PaddingTop(12).Element(ComposeTotals);
                        column.Item().PaddingTop(12).Element(ComposePaymentInfo);
                    });

                    page.Footer().Element(ComposePageFooter);
                });
            });
        }

        private void ComposeTotals(IContainer container)
        {
            container.AlignRight().Column(column =>
            {
                column.Item().Width(200).AlignRight().Column(totalsCol =>
                {
                    totalsCol.Item().Row(row =>
                    {
                        row.RelativeItem().Text("Subtotal:")
                            .FontSize(10)
                            .FontColor(MediumText);
                        row.AutoItem().Text(FormatCurrency(Subtotal))
                            .FontSize(10)
                            .FontColor(DarkText)
                            .Bold();
                    });

                    if (TaxAmount.HasValue && TaxAmount.Value > 0)
                    {
                        totalsCol.Item().PaddingTop(4).Row(row =>
                        {
                            row.RelativeItem().Text("Tax:")
                                .FontSize(10)
                                .FontColor(MediumText);
                            row.AutoItem().Text(FormatCurrency(TaxAmount.Value))
                                .FontSize(10)
                                .FontColor(DarkText);
                        });
                    }

                    totalsCol.Item().PaddingTop(6).Height(1).Background(BorderColor);

                    var total = Subtotal + (TaxAmount ?? 0);
                    totalsCol.Item().PaddingTop(6).Row(row =>
                    {
                        row.RelativeItem().Text("TOTAL:")
                            .FontSize(12)
                            .Bold()
                            .FontColor(DarkText);
                        row.AutoItem().Text(FormatCurrency(total))
                            .FontSize(12)
                            .Bold()
                            .FontColor(DarkText);
                    });
                });
            });
        }

        private void ComposePaymentInfo(IContainer container)
        {
            container.Column(column =>
            {
                column.Item().Text("Payment Information")
                    .FontSize(10)
                    .Bold()
                    .FontColor(DarkText);
                
                if (!string.IsNullOrEmpty(PaymentMethod))
                {
                    column.Item().PaddingTop(4).Text($"Payment Method: {PaymentMethod}")
                        .FontSize(9)
                        .FontColor(MediumText);
                }
                
                column.Item().PaddingTop(4).Text($"Payment due by {DueDate}.")
                    .FontSize(9)
                    .FontColor(MediumText);
            });
        }

        private void ComposePageFooter(IContainer container)
        {
            container.BorderTop(1)
                .BorderColor(BorderColor)
                .PaddingTop(8)
                .Row(row =>
                {
                    row.RelativeItem()
                        .DefaultTextStyle(style => style.FontSize(8).FontColor(MediumText))
                        .Text(text =>
                        {
                            text.Span("Powered by ");
                            text.Span("Cimmple").Bold();
                        });
                    
                    row.RelativeItem().AlignRight()
                        .DefaultTextStyle(style => style.FontSize(8).FontColor(MediumText))
                        .Text(text =>
                        {
                            text.Span("Page ");
                            text.CurrentPageNumber();
                            text.Span(" of ");
                            text.TotalPages();
                        });
                });
        }
    }
}
