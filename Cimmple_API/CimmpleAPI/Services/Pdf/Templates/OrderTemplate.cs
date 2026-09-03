using QuestPDF.Fluent;
using QuestPDF.Infrastructure;
using CimmpleAPI.Services.Pdf.Models;

namespace CimmpleAPI.Services.Pdf.Templates
{
    public class OrderTemplate : BaseDocumentTemplate
    {
        private readonly string OrderNumber;
        private readonly string OrderDate;
        private readonly string QuotationNo;

        public OrderTemplate(PdfDocumentData data, string orderNumber, string orderDate, string quotationNo) 
            : base(data)
        {
            OrderNumber = orderNumber;
            OrderDate = orderDate;
            QuotationNo = quotationNo;
        }

        public override Document Compose()
        {
            var headerDetails = new List<string>
            {
                $"Order No.: {OrderNumber}",
                $"Order Date: {OrderDate}"
            };
            
            if (!string.IsNullOrEmpty(QuotationNo))
            {
                headerDetails.Add($"Quotation No.: {QuotationNo}");
            }

            return Document.Create(container =>
            {
                container.Page(page =>
                {
                    page.Size(QuestPDF.Helpers.PageSizes.A4);
                    page.Margin(10, Unit.Millimetre);

                    page.Header().Element(header => ComposeHeader(header, "CUSTOMER ORDER", headerDetails.ToArray()));
                    
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
                        column.Item().PaddingTop(8).Text($"All amounts are in {CurrencyLabelForFooter()}.")
                            .FontSize(9)
                            .FontColor(MediumText);
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
