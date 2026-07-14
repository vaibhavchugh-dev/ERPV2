using QuestPDF.Fluent;
using QuestPDF.Infrastructure;
using CimmpleAPI.Services.Pdf.Models;

namespace CimmpleAPI.Services.Pdf.Templates
{
    public class VendorOrderTemplate : BaseDocumentTemplate
    {
        private readonly string OrderNumber;
        private readonly string OrderDate;
        private readonly string VendorPoNumber;
        private readonly string ShippingInstructions;

        public VendorOrderTemplate(PdfDocumentData data, string orderNumber, string orderDate, string vendorPoNumber, string shippingInstructions = "") 
            : base(data)
        {
            OrderNumber = orderNumber;
            OrderDate = orderDate;
            VendorPoNumber = vendorPoNumber;
            ShippingInstructions = shippingInstructions;
        }

        public override Document Compose()
        {
            var headerDetails = new List<string>
            {
                $"PO No.: {OrderNumber}",
                $"Order Date: {OrderDate}"
            };
            
            if (!string.IsNullOrEmpty(VendorPoNumber))
            {
                headerDetails.Add($"Vendor PO: {VendorPoNumber}");
            }

            return Document.Create(container =>
            {
                container.Page(page =>
                {
                    page.Size(QuestPDF.Helpers.PageSizes.A4);
                    page.Margin(10, Unit.Millimetre);

                    page.Header().Element(header => ComposeHeader(header, "PURCHASE ORDER", headerDetails.ToArray()));
                    
                    page.Content().Column(column =>
                    {
                        column.Spacing(12);
                        column.Item().Element(ComposeAddressSection);

                        column.Item().Element(container => container
                            .PaddingTop(12)
                            .Table(table =>
                            {
                                ComposeTableContent(table, DocumentData.LineItems,
                                    new[] { "Part No", "Part Description", "Due Date", "Unit", "Qty", "Unit Price", "Discount", "Amount", "Notes" });
                            }));

                        column.Item().PaddingTop(12).Element(ComposeTotals);
                        
                        if (!string.IsNullOrEmpty(ShippingInstructions))
                        {
                            column.Item().PaddingTop(12).Element(ComposeShippingInstructions);
                        }
                        
                        column.Item().PaddingTop(12).Element(ComposeTerms);
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
                        row.AutoItem().Text(FormatCurrency(DocumentData.TotalAmount))
                            .FontSize(10)
                            .FontColor(DarkText)
                            .Bold();
                    });

                    totalsCol.Item().PaddingTop(6).Height(1).Background(BorderColor);

                    totalsCol.Item().PaddingTop(6).Row(row =>
                    {
                        row.RelativeItem().Text("TOTAL:")
                            .FontSize(12)
                            .Bold()
                            .FontColor(DarkText);
                        row.AutoItem().Text(FormatCurrency(DocumentData.TotalAmount))
                            .FontSize(12)
                            .Bold()
                            .FontColor(DarkText);
                    });
                });
            });
        }

        private void ComposeShippingInstructions(IContainer container)
        {
            container.Column(column =>
            {
                column.Item().Text("Shipping Instructions")
                    .FontSize(10)
                    .Bold()
                    .FontColor(DarkText);
                
                column.Item().PaddingTop(4).Text(ShippingInstructions)
                    .FontSize(9)
                    .FontColor(MediumText);
            });
        }

        private void ComposeTerms(IContainer container)
        {
            container.Column(column =>
            {
                column.Item().Text("Terms & Conditions")
                    .FontSize(10)
                    .Bold()
                    .FontColor(DarkText);
                
                column.Item().PaddingTop(4).Text("Please confirm receipt of this purchase order. Delivery terms and payment terms as agreed.")
                    .FontSize(9)
                    .FontColor(MediumText);
                
                column.Item().PaddingTop(8).Text("Thank you for your service!")
                    .FontSize(9)
                    .Bold()
                    .FontColor(DarkText);
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

