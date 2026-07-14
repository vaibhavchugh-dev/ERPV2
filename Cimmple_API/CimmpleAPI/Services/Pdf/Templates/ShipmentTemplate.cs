using QuestPDF.Fluent;
using QuestPDF.Infrastructure;
using CimmpleAPI.Services.Pdf.Models;

namespace CimmpleAPI.Services.Pdf.Templates
{
    public class ShipmentTemplate : BaseDocumentTemplate
    {
        private readonly string ShipmentNumber;
        private readonly string ShipmentDate;
        private readonly string TrackingNumber;
        private readonly string Carrier;
        private readonly string OrderNumber;

        public ShipmentTemplate(PdfDocumentData data, string shipmentNumber, string shipmentDate, string trackingNumber = "", string carrier = "", string orderNumber = "") 
            : base(data)
        {
            ShipmentNumber = shipmentNumber;
            ShipmentDate = shipmentDate;
            TrackingNumber = trackingNumber;
            Carrier = carrier;
            OrderNumber = orderNumber;
        }

        public override Document Compose()
        {
            var headerDetails = new List<string>
            {
                $"Shipment No.: {ShipmentNumber}",
                $"Shipment Date: {ShipmentDate}"
            };
            
            if (!string.IsNullOrEmpty(OrderNumber))
            {
                headerDetails.Add($"Order No.: {OrderNumber}");
            }

            if (!string.IsNullOrEmpty(TrackingNumber))
            {
                headerDetails.Add($"Tracking No.: {TrackingNumber}");
            }

            if (!string.IsNullOrEmpty(Carrier))
            {
                headerDetails.Add($"Carrier: {Carrier}");
            }

            return Document.Create(container =>
            {
                container.Page(page =>
                {
                    page.Size(QuestPDF.Helpers.PageSizes.A4);
                    page.Margin(10, Unit.Millimetre);

                    page.Header().Element(header => ComposeHeader(header, "SHIPPING DOCUMENT", headerDetails.ToArray()));
                    
                    page.Content().Column(column =>
                    {
                        column.Spacing(12);
                        column.Item().Element(ComposeAddressSection);

                        column.Item().Element(container => container
                            .PaddingTop(12)
                            .Table(table =>
                            {
                                ComposeShipmentTable(table, DocumentData.LineItems);
                            }));

                        column.Item().PaddingTop(12).Element(ComposeShippingInfo);
                    });

                    page.Footer().Element(ComposePageFooter);
                });
            });
        }

        private void ComposeShipmentTable(QuestPDF.Fluent.TableDescriptor table, List<PdfLineItem> lineItems)
        {
            // Define columns for shipment table
            table.ColumnsDefinition(columns =>
            {
                columns.RelativeColumn(1.5f); // Part No
                columns.RelativeColumn(3.0f); // Description
                columns.RelativeColumn(0.8f); // Unit
                columns.RelativeColumn(1.0f); // Qty Shipped
                columns.RelativeColumn(2.0f); // Notes
            });

            // Header row
            table.Header(header =>
            {
                header.Cell().Element(HeaderCellStyle).Text("Part No").FontSize(9).Bold().FontColor(QuestPDF.Helpers.Colors.White);
                header.Cell().Element(HeaderCellStyle).Text("Part Description").FontSize(9).Bold().FontColor(QuestPDF.Helpers.Colors.White);
                header.Cell().Element(HeaderCellStyle).Text("Unit").FontSize(9).Bold().FontColor(QuestPDF.Helpers.Colors.White);
                header.Cell().Element(HeaderCellStyle).AlignRight().Text("Qty Shipped").FontSize(9).Bold().FontColor(QuestPDF.Helpers.Colors.White);
                header.Cell().Element(HeaderCellStyle).Text("Notes").FontSize(9).Bold().FontColor(QuestPDF.Helpers.Colors.White);
            });

            // Data rows
            int rowIndex = 0;
            foreach (var item in lineItems)
            {
                var rowBg = rowIndex % 2 == 0 ? "#FFFFFF" : LightBg;

                table.Cell().Element(c => CellStyle(c, rowBg)).Text(item.PartNo ?? "").FontSize(9).FontColor(DarkText);
                table.Cell().Element(c => CellStyle(c, rowBg)).Text(item.PartDescription ?? "").FontSize(9).FontColor(DarkText);
                table.Cell().Element(c => CellStyle(c, rowBg)).Text(item.Unit ?? "EA").FontSize(9).FontColor(MediumText);
                table.Cell().Element(c => CellStyle(c, rowBg)).AlignRight().Text(item.Qty.ToString()).FontSize(9).FontColor(DarkText).Bold();
                table.Cell().Element(c => CellStyle(c, rowBg)).Text(item.Notes ?? "").FontSize(9).FontColor(MediumText);

                rowIndex++;
            }
        }

        private void ComposeShippingInfo(IContainer container)
        {
            container.Column(column =>
            {
                column.Item().Height(1).Background(BorderColor);
                
                column.Item().PaddingTop(10).Column(infoCol =>
                {
                    infoCol.Item().Text("Shipping Information")
                        .FontSize(10)
                        .Bold()
                        .FontColor(DarkText);
                    
                    if (!string.IsNullOrEmpty(TrackingNumber))
                    {
                        infoCol.Item().PaddingTop(4).Row(row =>
                        {
                            row.AutoItem().Text("Tracking Number:")
                                .FontSize(9)
                                .FontColor(MediumText);
                            row.RelativeItem().PaddingLeft(4).Text(TrackingNumber)
                                .FontSize(9)
                                .Bold()
                                .FontColor(DarkText);
                        });
                    }
                    
                    if (!string.IsNullOrEmpty(Carrier))
                    {
                        infoCol.Item().PaddingTop(4).Row(row =>
                        {
                            row.AutoItem().Text("Carrier:")
                                .FontSize(9)
                                .FontColor(MediumText);
                            row.RelativeItem().PaddingLeft(4).Text(Carrier)
                                .FontSize(9)
                                .FontColor(DarkText);
                        });
                    }
                    
                    infoCol.Item().PaddingTop(8).Text("Items have been shipped as indicated above. Please confirm receipt upon delivery.")
                        .FontSize(9)
                        .FontColor(MediumText);
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

