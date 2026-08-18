using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using System.IO;
using CimmpleAPI.Services.Pdf.Models;

namespace CimmpleAPI.Services.Pdf.Templates
{
    public abstract class BaseDocumentTemplate
    {
        protected readonly PdfDocumentData DocumentData;
        
        protected BaseDocumentTemplate(PdfDocumentData data)
        {
            DocumentData = data;
        }

        // Professional color palette - simple and clean
        protected static string PrimaryColor => "#2563EB"; // Professional blue
        protected static string DarkText => "#1F2937"; // Dark gray for text
        protected static string MediumText => "#6B7280"; // Medium gray
        protected static string LightBg => "#F9FAFB"; // Very light background
        protected static string BorderColor => "#E5E7EB"; // Light border
        protected static string HeaderBg => "#2563EB"; // Header background

        // Clean header design with logo space
        protected void ComposeHeader(IContainer container, string documentTitle, string[] headerDetails)
        {
            container.Column(column =>
            {
                column.Item().Row(row =>
                {
                    // Left: Logo and Company info
                    row.RelativeItem(2).Row(companyRow =>
                    {
                        // Logo (60x60) - load from file if available
                        companyRow.AutoItem().Width(60).Height(60).Element(logoContainer =>
                        {
                            if (!string.IsNullOrEmpty(DocumentData.LogoPath) && File.Exists(DocumentData.LogoPath))
                            {
                                try
                                {
                                    logoContainer.Image(Image.FromFile(DocumentData.LogoPath))
                                        .FitArea();
                                }
                                catch
                                {
                                    // Fallback to placeholder if image fails to load
                                    logoContainer.Background(LightBg)
                                        .Border(1)
                                        .BorderColor(BorderColor)
                                        .Padding(4)
                                        .AlignCenter()
                                        .AlignMiddle()
                                        .Text("LOGO")
                                        .FontSize(7)
                                        .FontColor(MediumText);
                                }
                            }
                            else
                            {
                                // Logo placeholder
                                logoContainer.Background(LightBg)
                                    .Border(1)
                                    .BorderColor(BorderColor)
                                    .Padding(4)
                                    .AlignCenter()
                                    .AlignMiddle()
                                    .Text("LOGO")
                                    .FontSize(7)
                                    .FontColor(MediumText);
                            }
                        });
                        
                        companyRow.RelativeItem().PaddingLeft(12).Column(companyCol =>
                        {
                            companyCol.Item().Text(DocumentData.CompanyName)
                                .FontSize(14)
                                .Bold()
                                .FontColor(DarkText);
                            
                            companyCol.Item().PaddingTop(4);
                            
                            if (!string.IsNullOrEmpty(DocumentData.CompanyAddress))
                            {
                                companyCol.Item().Text(DocumentData.CompanyAddress)
                                    .FontSize(9)
                                    .FontColor(MediumText);
                            }
                            
                            if (!string.IsNullOrEmpty(DocumentData.CompanyCityStateZip))
                            {
                                companyCol.Item().Text(DocumentData.CompanyCityStateZip)
                                    .FontSize(9)
                                    .FontColor(MediumText);
                            }
                            
                            if (!string.IsNullOrEmpty(DocumentData.CompanyPhone))
                            {
                                companyCol.Item().Text($"Phone: {DocumentData.CompanyPhone}")
                                    .FontSize(9)
                                    .FontColor(MediumText);
                            }
                            
                            if (!string.IsNullOrEmpty(DocumentData.CompanyEmail))
                            {
                                companyCol.Item().Text(DocumentData.CompanyEmail)
                                    .FontSize(9)
                                    .FontColor(MediumText);
                            }
                            
                            if (!string.IsNullOrEmpty(DocumentData.CompanyWebAddress))
                            {
                                companyCol.Item().Text(DocumentData.CompanyWebAddress)
                                    .FontSize(9)
                                    .FontColor(MediumText);
                            }
                        });
                    });

                    // Right: Document title and details
                    row.RelativeItem(1).AlignRight().Column(detailsCol =>
                    {
                        detailsCol.Item().Text(documentTitle)
                            .FontSize(24)
                            .Bold()
                            .FontColor(PrimaryColor)
                            .AlignRight();
                        
                        detailsCol.Item().PaddingTop(10);
                        
                        foreach (var detail in headerDetails)
                        {
                            if (!string.IsNullOrEmpty(detail))
                            {
                                detailsCol.Item().Text(detail)
                                    .FontSize(9)
                                    .FontColor(MediumText)
                                    .AlignRight();
                            }
                        }
                    });
                });
                
                // Divider line
                column.Item().PaddingTop(12).Height(1).Background(BorderColor);
            });
        }
        
        // Overload for highlighting invoice number
        protected void ComposeHeader(IContainer container, string documentTitle, string[] headerDetails, string highlightDetail)
        {
            container.Column(column =>
            {
                column.Item().Row(row =>
                {
                    // Left: Logo and Company info
                    row.RelativeItem(2).Row(companyRow =>
                    {
                        // Logo (60x60) - load from file if available
                        companyRow.AutoItem().Width(60).Height(60).Element(logoContainer =>
                        {
                            if (!string.IsNullOrEmpty(DocumentData.LogoPath) && File.Exists(DocumentData.LogoPath))
                            {
                                try
                                {
                                    logoContainer.Image(Image.FromFile(DocumentData.LogoPath))
                                        .FitArea();
                                }
                                catch
                                {
                                    // Fallback to placeholder if image fails to load
                                    logoContainer.Background(LightBg)
                                        .Border(1)
                                        .BorderColor(BorderColor)
                                        .Padding(4)
                                        .AlignCenter()
                                        .AlignMiddle()
                                        .Text("LOGO")
                                        .FontSize(7)
                                        .FontColor(MediumText);
                                }
                            }
                            else
                            {
                                // Logo placeholder
                                logoContainer.Background(LightBg)
                                    .Border(1)
                                    .BorderColor(BorderColor)
                                    .Padding(4)
                                    .AlignCenter()
                                    .AlignMiddle()
                                    .Text("LOGO")
                                    .FontSize(7)
                                    .FontColor(MediumText);
                            }
                        });
                        
                        companyRow.RelativeItem().PaddingLeft(12).Column(companyCol =>
                        {
                            companyCol.Item().Text(DocumentData.CompanyName)
                                .FontSize(14)
                                .Bold()
                                .FontColor(DarkText);
                            
                            companyCol.Item().PaddingTop(4);
                            
                            if (!string.IsNullOrEmpty(DocumentData.CompanyAddress))
                            {
                                companyCol.Item().Text(DocumentData.CompanyAddress)
                                    .FontSize(9)
                                    .FontColor(MediumText);
                            }
                            
                            if (!string.IsNullOrEmpty(DocumentData.CompanyCityStateZip))
                            {
                                companyCol.Item().Text(DocumentData.CompanyCityStateZip)
                                    .FontSize(9)
                                    .FontColor(MediumText);
                            }
                            
                            if (!string.IsNullOrEmpty(DocumentData.CompanyPhone))
                            {
                                companyCol.Item().Text($"Phone: {DocumentData.CompanyPhone}")
                                    .FontSize(9)
                                    .FontColor(MediumText);
                            }
                            
                            if (!string.IsNullOrEmpty(DocumentData.CompanyEmail))
                            {
                                companyCol.Item().Text(DocumentData.CompanyEmail)
                                    .FontSize(9)
                                    .FontColor(MediumText);
                            }
                            
                            if (!string.IsNullOrEmpty(DocumentData.CompanyWebAddress))
                            {
                                companyCol.Item().Text(DocumentData.CompanyWebAddress)
                                    .FontSize(9)
                                    .FontColor(MediumText);
                            }
                        });
                    });

                    // Right: Document title and details
                    row.RelativeItem(1).AlignRight().Column(detailsCol =>
                    {
                        detailsCol.Item().Text(documentTitle)
                            .FontSize(24)
                            .Bold()
                            .FontColor(PrimaryColor)
                            .AlignRight();
                        
                        detailsCol.Item().PaddingTop(10);
                        
                        foreach (var detail in headerDetails)
                        {
                            if (!string.IsNullOrEmpty(detail))
                            {
                                var isHighlighted = !string.IsNullOrEmpty(highlightDetail) && detail.Contains(highlightDetail);
                                var textElement = detailsCol.Item().Text(detail)
                                    .FontSize(isHighlighted ? 11 : 9)
                                    .FontColor(isHighlighted ? PrimaryColor : MediumText)
                                    .AlignRight();
                                
                                if (isHighlighted)
                                {
                                    textElement.Bold();
                                }
                            }
                        }
                    });
                });
                
                // Divider line
                column.Item().PaddingTop(12).Height(1).Background(BorderColor);
            });
        }

        // Clean address section
        protected void ComposeAddressSection(IContainer container)
        {
            container.PaddingTop(12).Row(row =>
            {
                // Bill To
                row.RelativeItem().PaddingRight(8).Column(billCol =>
                {
                    billCol.Item().Text("Bill To")
                        .FontSize(10)
                        .Bold()
                        .FontColor(DarkText);
                    
                    billCol.Item().PaddingTop(4);
                    
                    billCol.Item().Text(DocumentData.CustomerName)
                        .FontSize(10)
                        .FontColor(DarkText);
                    
                    billCol.Item().PaddingTop(2);
                    
                    foreach (var line in DocumentData.BillingAddress)
                    {
                        if (!string.IsNullOrEmpty(line))
                        {
                            billCol.Item().Text(line)
                                .FontSize(9)
                                .FontColor(MediumText);
                        }
                    }
                    
                    if (!string.IsNullOrEmpty(DocumentData.PhoneNumber))
                    {
                        billCol.Item().PaddingTop(4).Text($"Phone: {DocumentData.PhoneNumber}")
                            .FontSize(9)
                            .FontColor(MediumText);
                    }
                });

                // Ship To
                row.RelativeItem().PaddingLeft(8).Column(shipCol =>
                {
                    shipCol.Item().Text("Ship To")
                        .FontSize(10)
                        .Bold()
                        .FontColor(DarkText);
                    
                    shipCol.Item().PaddingTop(4);
                    
                    shipCol.Item().Text(DocumentData.CustomerName)
                        .FontSize(10)
                        .FontColor(DarkText);
                    
                    shipCol.Item().PaddingTop(2);
                    
                    var shippingAddress = DocumentData.ShippingAddress.Count > 0 
                        ? DocumentData.ShippingAddress 
                        : DocumentData.BillingAddress;
                    
                    foreach (var line in shippingAddress)
                    {
                        if (!string.IsNullOrEmpty(line))
                        {
                            shipCol.Item().Text(line)
                                .FontSize(9)
                                .FontColor(MediumText);
                        }
                    }
                });
            });
        }

        // Professional table
        protected void ComposeTable(IContainer container, List<PdfLineItem> lineItems, string[] headers)
        {
            container.PaddingTop(12).Table(table =>
            {
                ComposeTableContent(table, lineItems, headers);
            });
        }

        protected void ComposeTableContent(QuestPDF.Fluent.TableDescriptor table, List<PdfLineItem> lineItems, string[] headers)
        {
            // Define columns with optimized widths to prevent wrapping
            table.ColumnsDefinition(columns =>
            {
                columns.RelativeColumn(0.85f); // Part No
                columns.RelativeColumn(2.2f); // Description
                columns.ConstantColumn(58); // Date (MM/dd/yyyy — fixed width avoids wrap)
                columns.RelativeColumn(0.4f); // Unit
                columns.RelativeColumn(0.4f); // Qty
                columns.RelativeColumn(0.95f); // Unit Price
                columns.RelativeColumn(0.7f); // Discount
                columns.RelativeColumn(0.95f); // Amount
                columns.RelativeColumn(1.3f); // Notes
            });

            // Header row
            table.Header(header =>
            {
                int index = 0;
                foreach (var headerText in headers)
                {
                    var isNumeric = index >= 4 && index <= 7; // Qty, Unit Price, Discount, Amount
                    var cellContainer = header.Cell().Element(HeaderCellStyle);
                    
                    // Use shorter text for narrow columns to prevent wrapping
                    var displayText = headerText;
                    if (index == 2) displayText = "Date"; // Est. Date / Due Date — keep single line
                    if (index == 3) displayText = "Unit"; // Unit column
                    if (index == 4) displayText = "Qty"; // Qty column
                    if (index == 6) displayText = "Disc."; // Discount column

                    if (isNumeric)
                    {
                        cellContainer.AlignRight().Text(displayText)
                            .FontSize(8)
                            .Bold()
                            .FontColor(Colors.White);
                    }
                    else
                    {
                        cellContainer.AlignLeft().Text(displayText)
                            .FontSize(8)
                            .Bold()
                            .FontColor(Colors.White);
                    }
                    index++;
                }
            });

            // Data rows
            int rowIndex = 0;
            foreach (var item in lineItems)
            {
                var rowBg = rowIndex % 2 == 0 ? "#FFFFFF" : LightBg;

                table.Cell().Element(c => CellStyle(c, rowBg)).Text(item.PartNo ?? "").FontSize(9).FontColor(DarkText);
                table.Cell().Element(c => CellStyle(c, rowBg)).Column(col =>
                {
                    col.Item().Text(item.PartDescription ?? "").FontSize(9).FontColor(DarkText);
                    if (item.PrintQtyOptions != null && item.PrintQtyOptions.Count > 0)
                    {
                        var optionText = "Unit price by qty: " + string.Join("  |  ",
                            item.PrintQtyOptions
                                .OrderBy(o => o.Qty)
                                .Select(o => $"{o.Qty} @ {FormatCurrency(o.UnitPrice)}/ea"));
                        col.Item().PaddingTop(2).Text(optionText)
                            .FontSize(7)
                            .FontColor(MediumText);
                    }
                });
                table.Cell().Element(c => CellStyleTight(c, rowBg))
                    .AlignCenter()
                    .Text(item.Date ?? "")
                    .FontSize(8)
                    .FontColor(MediumText)
                    .WrapAnywhere(false);
                table.Cell().Element(c => CellStyle(c, rowBg)).Text(item.Unit ?? "EA").FontSize(9).FontColor(MediumText);
                table.Cell().Element(c => CellStyle(c, rowBg)).AlignRight().Text(item.Qty.ToString()).FontSize(9).FontColor(DarkText);
                table.Cell().Element(c => CellStyle(c, rowBg)).AlignRight().Text(FormatCurrency(item.UnitPrice)).FontSize(9).FontColor(DarkText);
                table.Cell().Element(c => CellStyle(c, rowBg)).AlignRight().Text(FormatCurrency(item.DiscountAmount)).FontSize(9).FontColor(MediumText);
                table.Cell().Element(c => CellStyle(c, rowBg)).AlignRight().Text(FormatCurrency(item.Amount)).FontSize(9).FontColor(DarkText).Bold();
                table.Cell().Element(c => CellStyle(c, rowBg)).Text(item.Notes ?? "").FontSize(9).FontColor(MediumText);

                rowIndex++;
            }
        }

        protected IContainer HeaderCellStyle(IContainer container)
        {
            return container
                .Background(HeaderBg)
                .PaddingVertical(6)
                .PaddingHorizontal(4);
        }

        protected IContainer CellStyle(IContainer container, string backgroundColor)
        {
            return container
                .Background(backgroundColor)
                .BorderBottom(1)
                .BorderColor(BorderColor)
                .PaddingVertical(6)
                .PaddingHorizontal(6);
        }

        protected IContainer CellStyleTight(IContainer container, string backgroundColor)
        {
            return container
                .Background(backgroundColor)
                .BorderBottom(1)
                .BorderColor(BorderColor)
                .PaddingVertical(6)
                .PaddingHorizontal(2);
        }

        protected string FormatCurrency(decimal amount)
        {
            return amount.ToString("C2", System.Globalization.CultureInfo.CreateSpecificCulture("en-US"));
        }

        protected string FormatDate(DateTime? date)
        {
            return date?.ToString("MM/dd/yyyy") ?? "";
        }

        // Abstract method for document-specific content
        public abstract Document Compose();
    }
}
