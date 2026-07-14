using QuestPDF.Fluent;
using QuestPDF.Infrastructure;
using CimmpleAPI.Services.Pdf.Models;

namespace CimmpleAPI.Services.Pdf.Templates
{
    public class QuotationTemplate : BaseDocumentTemplate
    {
        private readonly string QuotationNumber;
        private readonly string QuotationDate;
        private readonly string CustomerRefNo;

        public QuotationTemplate(PdfDocumentData data, string quotationNumber, string quotationDate, string customerRefNo) 
            : base(data)
        {
            QuotationNumber = quotationNumber;
            QuotationDate = quotationDate;
            CustomerRefNo = customerRefNo;
        }

        public override Document Compose()
        {
            var headerDetails = new List<string>
            {
                $"Quotation No.: {QuotationNumber}",
                $"Quotation Date: {QuotationDate}"
            };
            
            if (!string.IsNullOrEmpty(CustomerRefNo))
            {
                headerDetails.Add($"Customer Ref. No. {CustomerRefNo}");
            }

            return Document.Create(container =>
            {
                container.Page(page =>
                {
                    page.Size(QuestPDF.Helpers.PageSizes.A4);
                    page.Margin(10, Unit.Millimetre);

                    page.Header().Element(header => ComposeHeader(header, "QUOTATION", headerDetails.ToArray()));
                    
                    page.Content().Column(column =>
                    {
                        column.Spacing(12);
                        column.Item().Element(ComposeAddressSection);

                        column.Item().Element(container => container
                            .PaddingTop(12)
                            .Table(table =>
                            {
                                ComposeTableContent(table, DocumentData.LineItems,
                                    new[] { "Part No", "Part Description", "Est. Date", "Unit", "Qty", "Unit Price", "Discount", "Amount", "Notes" });
                            }));

                        column.Item().PaddingTop(12).Element(ComposeTotals);
                        column.Item().PaddingTop(12).Element(ComposeFooter);
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

        private void ComposeFooter(IContainer container)
        {
            container.Column(column =>
            {
                column.Item().Text("Terms & Conditions")
                    .FontSize(10)
                    .Bold()
                    .FontColor(DarkText);
                
                column.Item().PaddingTop(4).Text("This quotation is valid for 30 days from the date of issue. Prices are subject to change without notice.")
                    .FontSize(9)
                    .FontColor(MediumText);
                
                column.Item().PaddingTop(4).Text("Payment terms: Net 30 days. All prices are in USD unless otherwise stated.")
                    .FontSize(9)
                    .FontColor(MediumText);
                
                column.Item().PaddingTop(8).Text("Thank you for your business!")
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

