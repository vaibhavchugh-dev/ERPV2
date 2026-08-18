using System.Collections.Generic;
using QuestPDF.Fluent;
using QuestPDF.Infrastructure;
using CimmpleAPI.Services.Pdf.Models;

namespace CimmpleAPI.Services.Pdf.Templates
{
    public class NcrPdfContent
    {
        public string NcrNumber { get; set; } = "";
        public string Title { get; set; } = "";
        public string Status { get; set; } = "";
        public string Source { get; set; } = "";
        public string Category { get; set; } = "";
        public string Severity { get; set; } = "";
        public string Description { get; set; } = "";
        public string JobOrderNumber { get; set; } = "";
        public string PartNo { get; set; } = "";
        public string PartName { get; set; } = "";
        public string CustomerName { get; set; } = "";
        public string VendorName { get; set; } = "";
        public string PoNumber { get; set; } = "";
        public string NcrCode { get; set; } = "";
        public string DefectLocation { get; set; } = "";
        public int DefectQuantity { get; set; }
        public int TotalQuantity { get; set; }
        public string DefectDescription { get; set; } = "";
        public string DueDate { get; set; } = "";
        public string ReportedBy { get; set; } = "";
        public string ReportedDate { get; set; } = "";
        public string Investigator { get; set; } = "";
        public string Approver { get; set; } = "";
        public string RootCauseCategory { get; set; } = "";
        public string RootCause { get; set; } = "";
        public string ImmediateAction { get; set; } = "";
        public string CorrectiveAction { get; set; } = "";
        public string PreventiveAction { get; set; } = "";
        public string CostImpact { get; set; } = "";
        public string Notes { get; set; } = "";
    }

    public class NcrTemplate : BaseDocumentTemplate
    {
        private readonly NcrPdfContent _ncr;

        public NcrTemplate(PdfDocumentData data, NcrPdfContent ncr) : base(data)
        {
            _ncr = ncr;
        }

        public override Document Compose()
        {
            var headerDetails = new List<string>
            {
                $"NCR No.: {_ncr.NcrNumber}",
                $"Status: {FormatLabel(_ncr.Status)}",
                $"Severity: {_ncr.Severity}"
            };

            return Document.Create(container =>
            {
                container.Page(page =>
                {
                    page.Size(QuestPDF.Helpers.PageSizes.A4);
                    page.Margin(10, QuestPDF.Infrastructure.Unit.Millimetre);
                    page.Header().Element(header => ComposeHeader(header, "NON-CONFORMANCE REPORT", headerDetails.ToArray()));
                    page.Content().PaddingTop(8).Column(col =>
                    {
                        col.Item().Element(ComposeSummary);
                        col.Item().PaddingTop(10).Element(ComposeSource);
                        col.Item().PaddingTop(10).Element(ComposeDefect);
                        col.Item().PaddingTop(10).Element(ComposeActions);
                    });
                    page.Footer().Element(ComposePageFooter);
                });
            });
        }

        private void ComposeSummary(IContainer container)
        {
            container.Background(LightBg).Padding(12).Column(col =>
            {
                Field(col, "Title", _ncr.Title);
                Field(col, "NCR Code", Dash(_ncr.NcrCode));
                Field(col, "Category", FormatLabel(_ncr.Category));
                Field(col, "Source", _ncr.Source);
                Field(col, "Description", string.IsNullOrWhiteSpace(_ncr.Description) ? "-" : _ncr.Description);
            });
        }

        private void ComposeSource(IContainer container)
        {
            container.Column(col =>
            {
                col.Item().Text("Linked Records").FontSize(11).Bold().FontColor(DarkText);
                col.Item().PaddingTop(6).Row(row =>
                {
                    row.RelativeItem().Column(left =>
                    {
                        Field(left, "Job Order", Dash(_ncr.JobOrderNumber));
                        Field(left, "Part No", Dash(_ncr.PartNo));
                        Field(left, "Part Name", Dash(_ncr.PartName));
                        Field(left, "Customer", Dash(_ncr.CustomerName));
                    });
                    row.RelativeItem().PaddingLeft(12).Column(right =>
                    {
                        Field(right, "Vendor", Dash(_ncr.VendorName));
                        Field(right, "PO / VO", Dash(_ncr.PoNumber));
                        Field(right, "Reported By", Dash(_ncr.ReportedBy));
                        Field(right, "Reported Date", Dash(_ncr.ReportedDate));
                    });
                });
            });
        }

        private void ComposeDefect(IContainer container)
        {
            container.Column(col =>
            {
                col.Item().Text("Defect Details").FontSize(11).Bold().FontColor(DarkText);
                col.Item().PaddingTop(6).Column(body =>
                {
                    Field(body, "Location", Dash(_ncr.DefectLocation));
                    Field(body, "Quantity", $"{_ncr.DefectQuantity} / {_ncr.TotalQuantity}");
                    Field(body, "Due Date", Dash(_ncr.DueDate));
                    Field(body, "Defect Description", Dash(_ncr.DefectDescription));
                    Field(body, "Root Cause Category", Dash(_ncr.RootCauseCategory));
                    Field(body, "Root Cause", Dash(_ncr.RootCause));
                    Field(body, "Cost Impact", Dash(_ncr.CostImpact));
                });
            });
        }

        private void ComposeActions(IContainer container)
        {
            container.Column(col =>
            {
                col.Item().Text("Actions & Workflow").FontSize(11).Bold().FontColor(DarkText);
                col.Item().PaddingTop(6).Column(body =>
                {
                    Field(body, "Immediate Action", Dash(_ncr.ImmediateAction));
                    Field(body, "Corrective Action", Dash(_ncr.CorrectiveAction));
                    Field(body, "Preventive Action", Dash(_ncr.PreventiveAction));
                    Field(body, "Investigator", Dash(_ncr.Investigator));
                    Field(body, "Approver", Dash(_ncr.Approver));
                    Field(body, "Notes", Dash(_ncr.Notes));
                });
            });
        }

        private void Field(ColumnDescriptor col, string label, string value)
        {
            col.Item().PaddingTop(3).Row(r =>
            {
                r.ConstantItem(120).Text(label + ":").FontSize(9).FontColor(MediumText);
                r.RelativeItem().Text(value).FontSize(9).FontColor(DarkText);
            });
        }

        private static string Dash(string? value) => string.IsNullOrWhiteSpace(value) ? "-" : value;

        private static string FormatLabel(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return "-";
            return value.Replace("_", " ");
        }

        private void ComposePageFooter(IContainer container)
        {
            container.Row(row =>
            {
                row.RelativeItem().Text(text =>
                {
                    text.Span("Generated ").FontSize(8).FontColor(MediumText);
                    text.Span(System.DateTime.Now.ToString("MM/dd/yyyy HH:mm")).FontSize(8).FontColor(MediumText);
                });
                row.RelativeItem().AlignRight().Text(text =>
                {
                    text.Span("Page ").FontSize(8).FontColor(MediumText);
                    text.CurrentPageNumber().FontSize(8).FontColor(MediumText);
                    text.Span(" of ").FontSize(8).FontColor(MediumText);
                    text.TotalPages().FontSize(8).FontColor(MediumText);
                });
            });
        }
    }
}
