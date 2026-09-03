using QuestPDF.Fluent;
using QuestPDF.Infrastructure;
using CimmpleAPI.Services.Pdf.Models;

namespace CimmpleAPI.Services.Pdf.Templates
{
    public class VendorQuotationTemplate : BaseDocumentTemplate
    {
        private readonly string QuotationNumber;
        private readonly string QuotationDate;
        private readonly string VendorRefNo;
        private readonly string QuotationType;

        public VendorQuotationTemplate(PdfDocumentData data, string quotationNumber, string quotationDate, string vendorRefNo = "", string quotationType = "Material") 
            : base(data)
        {
            QuotationNumber = quotationNumber;
            QuotationDate = quotationDate;
            VendorRefNo = vendorRefNo;
            QuotationType = quotationType;
        }

        public override Document Compose()
        {
            var headerDetails = new List<string>
            {
                $"Quotation No.: {QuotationNumber}",
                $"Quotation Date: {QuotationDate}",
                $"Type: {QuotationType}"
            };
            
            if (!string.IsNullOrEmpty(VendorRefNo))
            {
                headerDetails.Add($"Vendor Ref. No.: {VendorRefNo}");
            }

            return Document.Create(container =>
            {
                container.Page(page =>
                {
                    page.Size(QuestPDF.Helpers.PageSizes.A4);
                    page.Margin(10, Unit.Millimetre);

                    page.Header().Element(header => ComposeHeader(header, "VENDOR QUOTATION REQUEST", headerDetails.ToArray()));
                    
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
                        column.Item().PaddingTop(12).Element(ComposeRequestFooter);
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
                        row.RelativeItem().Text("ESTIMATED TOTAL:")
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

        private void ComposeRequestFooter(IContainer container)
        {
            container.Column(column =>
            {
                column.Item().Text("Quotation Request")
                    .FontSize(10)
                    .Bold()
                    .FontColor(DarkText);
                
                column.Item().PaddingTop(4).Text("Please provide your best quotation for the items listed above. This quotation request is valid for 30 days from the date of issue.")
                    .FontSize(9)
                    .FontColor(MediumText);

                column.Item().PaddingTop(4).Text($"All amounts are in {CurrencyLabelForFooter()}.")
                    .FontSize(9)
                    .FontColor(MediumText);
                
                column.Item().PaddingTop(8).Text("We look forward to your response.")
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

