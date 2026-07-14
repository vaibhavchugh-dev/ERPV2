using System.Linq;
using QuestPDF.Fluent;
using QuestPDF.Infrastructure;
using CimmpleAPI.Services.Pdf.Models;

namespace CimmpleAPI.Services.Pdf.Templates
{
    public class JobOrderTemplate : BaseDocumentTemplate
    {
        private readonly string JobOrderNumber;
        private readonly string JobOrderDate;
        private readonly string JobNumber;
        private readonly string JobDesc;
        private readonly string DrawingNumber;
        private readonly string DrawingRevision;
        private readonly string CustomerOrderNumber;
        private readonly string CustomerOrderDate;
        private readonly string CustomerRefNo;
        private readonly string PartNo;
        private readonly string PartName;
        private readonly int QtyOrdered;
        private readonly string Unit;
        private readonly decimal UnitPrice;
        private readonly int JobPriority;
        private readonly string DueDate;
        private readonly string Status;

        public JobOrderTemplate(PdfDocumentData data, string jobOrderNumber, string jobOrderDate, 
            string jobNumber, string jobDesc, string drawingNumber, string drawingRevision, 
            string customerOrderNumber, string customerOrderDate, string customerRefNo,
            string partNo, string partName, int qtyOrdered, string unit, decimal unitPrice,
            int jobPriority, string dueDate, string status) 
            : base(data)
        {
            JobOrderNumber = jobOrderNumber;
            JobOrderDate = jobOrderDate;
            JobNumber = jobNumber;
            JobDesc = jobDesc;
            DrawingNumber = drawingNumber;
            DrawingRevision = drawingRevision;
            CustomerOrderNumber = customerOrderNumber;
            CustomerOrderDate = customerOrderDate;
            CustomerRefNo = customerRefNo;
            PartNo = partNo;
            PartName = partName;
            QtyOrdered = qtyOrdered;
            Unit = unit;
            UnitPrice = unitPrice;
            JobPriority = jobPriority;
            DueDate = dueDate;
            Status = status;
        }

        public override Document Compose()
        {
            var headerDetails = new List<string>
            {
                $"Job Order No.: {JobOrderNumber}",
                $"Date: {JobOrderDate}"
            };
            
            if (!string.IsNullOrEmpty(CustomerOrderNumber))
            {
                headerDetails.Add($"Customer Order: {CustomerOrderNumber}");
            }

            if (!string.IsNullOrEmpty(Status))
            {
                headerDetails.Add($"Status: {Status}");
            }

            return Document.Create(container =>
            {
                container.Page(page =>
                {
                    page.Size(QuestPDF.Helpers.PageSizes.A4);
                    page.Margin(10, QuestPDF.Infrastructure.Unit.Millimetre);

                    page.Header().Element(header => ComposeHeader(header, "JOB ORDER", headerDetails.ToArray()));
                    
                    page.Content().Column(column =>
                    {
                        column.Spacing(12);
                        column.Item().Element(ComposeCustomerAndPartDetails);

                        // Job Information Section
                        if (!string.IsNullOrEmpty(JobNumber) || !string.IsNullOrEmpty(JobDesc) || 
                            !string.IsNullOrEmpty(DrawingNumber) || !string.IsNullOrEmpty(DrawingRevision))
                        {
                            column.Item().PaddingTop(12).Element(container => ComposeJobInfo(container));
                        }

                        // Routing Steps Table
                        if (DocumentData.RoutingSteps != null && DocumentData.RoutingSteps.Count > 0)
                        {
                            column.Item().PaddingTop(12).PaddingBottom(8).AlignCenter().Text("Routing")
                                .FontSize(11)
                                .Bold()
                                .FontColor(DarkText);
                            
                            column.Item().Element(container => container
                                .Table(table =>
                                {
                                    ComposeRoutingStepsTable(table, DocumentData.RoutingSteps);
                                }));
                        }

                        // Remove totals section for job orders
                    });

                    page.Footer().Element(ComposePageFooter);
                });
            });
        }

        private void ComposeCustomerAndPartDetails(IContainer container)
        {
            container.PaddingTop(12).Row(row =>
            {
                // Customer Order Details - Left Column
                row.RelativeItem().PaddingRight(8).Column(customerCol =>
                {
                    customerCol.Item().Height(150).Element(bgContainer =>
                    {
                        bgContainer.Background(LightBg)
                            .Padding(12)
                            .Column(col =>
                            {
                                col.Item().PaddingBottom(8).Text("Customer Order Details")
                                .FontSize(11)
                                .Bold()
                                .FontColor(DarkText);

                            // CO#
                            col.Item().Row(r =>
                            {
                                r.RelativeItem(2).Text("CO#:")
                                    .FontSize(9)
                                    .FontColor(MediumText);
                                r.RelativeItem(3).Text(CustomerOrderNumber)
                                    .FontSize(9)
                                    .FontColor(DarkText)
                                    .Bold();
                            });

                            // Order Date
                            col.Item().PaddingTop(4).Row(r =>
                            {
                                r.RelativeItem(2).Text("Order Date:")
                                    .FontSize(9)
                                    .FontColor(MediumText);
                                r.RelativeItem(3).Text(CustomerOrderDate)
                                    .FontSize(9)
                                    .FontColor(DarkText);
                            });

                            // Customer Name
                            col.Item().PaddingTop(4).Row(r =>
                            {
                                r.RelativeItem(2).Text("Customer Name:")
                                    .FontSize(9)
                                    .FontColor(MediumText);
                                r.RelativeItem(3).Text(DocumentData.CustomerName)
                                    .FontSize(9)
                                    .FontColor(DarkText);
                            });

                            // Customer Ref No
                            col.Item().PaddingTop(4).Row(r =>
                            {
                                r.RelativeItem(2).Text("Customer Ref No:")
                                    .FontSize(9)
                                    .FontColor(MediumText);
                                r.RelativeItem(3).Text(string.IsNullOrEmpty(CustomerRefNo) ? "-" : CustomerRefNo)
                                    .FontSize(9)
                                    .FontColor(DarkText);
                            });
                            });
                    });
                });

                // Part Details - Right Column
                row.RelativeItem().PaddingLeft(8).Column(partCol =>
                {
                    partCol.Item().Height(150).Element(bgContainer =>
                    {
                        bgContainer.Background(LightBg)
                            .Padding(12)
                            .Column(col =>
                        {
                            col.Item().PaddingBottom(8).Text("Part Details")
                                .FontSize(11)
                                .Bold()
                                .FontColor(DarkText);

                            // Part No
                            col.Item().Row(r =>
                            {
                                r.RelativeItem(2).Text("Part No:")
                                    .FontSize(9)
                                    .FontColor(MediumText);
                                r.RelativeItem(3).Text(string.IsNullOrEmpty(PartNo) ? "-" : PartNo)
                                    .FontSize(9)
                                    .FontColor(DarkText)
                                    .Bold();
                            });

                            // Part Desc
                            col.Item().PaddingTop(4).Row(r =>
                            {
                                r.RelativeItem(2).Text("Part Desc:")
                                    .FontSize(9)
                                    .FontColor(MediumText);
                                r.RelativeItem(3).Text(string.IsNullOrEmpty(PartName) ? "-" : PartName)
                                    .FontSize(9)
                                    .FontColor(DarkText);
                            });

                            // Order Qty
                            col.Item().PaddingTop(4).Row(r =>
                            {
                                r.RelativeItem(2).Text("Order Qty:")
                                    .FontSize(9)
                                    .FontColor(MediumText);
                                r.RelativeItem(3).Text($"{QtyOrdered} {Unit}")
                                    .FontSize(9)
                                    .FontColor(DarkText);
                            });

                            // Due Date
                            col.Item().PaddingTop(4).Row(r =>
                            {
                                r.RelativeItem(2).Text("Due Date:")
                                    .FontSize(9)
                                    .FontColor(MediumText);
                                r.RelativeItem(3).Text(string.IsNullOrEmpty(DueDate) ? "-" : DueDate)
                                    .FontSize(9)
                                    .FontColor(DarkText);
                            });

                            // Drawing Number
                            col.Item().PaddingTop(4).Row(r =>
                            {
                                r.RelativeItem(2).Text("Drawing Number:")
                                    .FontSize(9)
                                    .FontColor(MediumText);
                                r.RelativeItem(3).Text(string.IsNullOrEmpty(DrawingNumber) ? "-" : DrawingNumber)
                                    .FontSize(9)
                                    .FontColor(DarkText);
                            });

                            // Drawing Revision
                            col.Item().PaddingTop(4).Row(r =>
                            {
                                r.RelativeItem(2).Text("Drawing Revision:")
                                    .FontSize(9)
                                    .FontColor(MediumText);
                                r.RelativeItem(3).Text(string.IsNullOrEmpty(DrawingRevision) ? "-" : DrawingRevision)
                                    .FontSize(9)
                                    .FontColor(DarkText);
                            });
                            });
                    });
                });
            });
        }

        private void ComposeJobInfo(IContainer container)
        {
            container.Background(LightBg)
                .Padding(12)
                .Border(1)
                .BorderColor(BorderColor)
                .Column(column =>
                {
                    column.Item().PaddingBottom(8).Text("Job Information")
                        .FontSize(11)
                        .Bold()
                        .FontColor(DarkText);

                    if (!string.IsNullOrEmpty(JobNumber))
                    {
                        column.Item().Row(row =>
                        {
                            row.RelativeItem(2).Text("Job Number:")
                                .FontSize(9)
                                .FontColor(MediumText);
                            row.RelativeItem(3).Text(JobNumber)
                                .FontSize(9)
                                .FontColor(DarkText)
                                .Bold();
                        });
                    }

                    if (!string.IsNullOrEmpty(JobDesc))
                    {
                        column.Item().PaddingTop(4).Row(row =>
                        {
                            row.RelativeItem(2).Text("Job Description:")
                                .FontSize(9)
                                .FontColor(MediumText);
                            row.RelativeItem(3).Text(JobDesc)
                                .FontSize(9)
                                .FontColor(DarkText);
                        });
                    }

                    if (!string.IsNullOrEmpty(DrawingNumber) || !string.IsNullOrEmpty(DrawingRevision))
                    {
                        column.Item().PaddingTop(4).Row(row =>
                        {
                            row.RelativeItem(2).Text("Drawing:")
                                .FontSize(9)
                                .FontColor(MediumText);
                            row.RelativeItem(3).Text($"{DrawingNumber ?? "N/A"} Rev. {DrawingRevision ?? "N/A"}")
                                .FontSize(9)
                                .FontColor(DarkText);
                        });
                    }
                });
        }

        private void ComposeRoutingStepsTable(TableDescriptor table, List<PdfRoutingStep> routingSteps)
        {
            // Define column widths
            table.ColumnsDefinition(columns =>
            {
                columns.ConstantColumn(40);  // Seq
                columns.RelativeColumn(3);    // Process/Operation
                columns.RelativeColumn(2);    // Assigned To
                columns.ConstantColumn(80);   // Est. Time
                columns.RelativeColumn(2);    // Status
            });

            // Header
            table.Header(header =>
            {
                header.Cell().Element(CellStyle).Text("Seq").FontSize(8).Bold().FontColor(DarkText);
                header.Cell().Element(CellStyle).Text("Process/Operation").FontSize(8).Bold().FontColor(DarkText);
                header.Cell().Element(CellStyle).Text("Assigned To").FontSize(8).Bold().FontColor(DarkText);
                header.Cell().Element(CellStyle).Text("Est. Time").FontSize(8).Bold().FontColor(DarkText);
                header.Cell().Element(CellStyle).Text("Status").FontSize(8).Bold().FontColor(DarkText);

                static IContainer CellStyle(IContainer container)
                {
                    return container
                        .Background(LightBg)
                        .PaddingVertical(6)
                        .PaddingHorizontal(8)
                        .AlignMiddle();
                }
            });

            // Rows
            foreach (var step in routingSteps.OrderBy(s => s.Sequence))
            {
                table.Cell().Element(CellStyle).Text(step.Sequence.ToString()).FontSize(9).FontColor(DarkText);
                
                var processText = step.ProcessName;
                if (!string.IsNullOrEmpty(step.Description))
                {
                    processText += $"\n{step.Description}";
                }
                table.Cell().Element(CellStyle).Text(processText).FontSize(9).FontColor(DarkText);
                
                var assignedTo = "";
                if (!string.IsNullOrEmpty(step.WorkstationName))
                {
                    assignedTo = step.WorkstationName;
                }
                if (!string.IsNullOrEmpty(step.TechnicianName))
                {
                    if (!string.IsNullOrEmpty(assignedTo)) assignedTo += " / ";
                    assignedTo += step.TechnicianName;
                }
                if (string.IsNullOrEmpty(assignedTo)) assignedTo = "-";
                table.Cell().Element(CellStyle).Text(assignedTo).FontSize(9).FontColor(DarkText);
                
                var estTime = step.EstimatedTime.HasValue ? $"{step.EstimatedTime} min" : "-";
                table.Cell().Element(CellStyle).Text(estTime).FontSize(9).FontColor(DarkText);
                
                table.Cell().Element(CellStyle).Text(step.Status ?? "Pending").FontSize(9).FontColor(DarkText);
            }

            static IContainer CellStyle(IContainer container)
            {
                return container
                    .BorderBottom(1)
                    .BorderColor(BorderColor)
                    .PaddingVertical(8)
                    .PaddingHorizontal(8);
            }
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

