namespace CimmpleAPI.Services.Pdf.Models
{
    public class PdfDocumentData
    {
        public string CompanyName { get; set; } = "Your Company Name";
        public string CompanyAddress { get; set; } = "123 Business Street";
        public string CompanyCityStateZip { get; set; } = "City, State 12345";
        public string CompanyEmail { get; set; } = "info@company.com";
        public string CompanyPhone { get; set; } = "";
        public string CompanyWebAddress { get; set; } = "";
        public string LogoPath { get; set; } = "";
        
        public string CustomerName { get; set; } = "";
        public List<string> BillingAddress { get; set; } = new();
        public List<string> ShippingAddress { get; set; } = new();
        public string BuyerName { get; set; } = "";
        public string PhoneNumber { get; set; } = "";
        
        public List<PdfLineItem> LineItems { get; set; } = new();
        public decimal TotalAmount { get; set; }

        // Currency formatting (from SystemSettings)
        public string DefaultCurrency { get; set; } = "USD";
        public string CurrencySymbol { get; set; } = "$";
        public string Locale { get; set; } = "en-US";
        public int DecimalPlaces { get; set; } = 2;
        public string DecimalSeparator { get; set; } = ".";
        public string ThousandsSeparator { get; set; } = ",";
        
        public List<PdfRoutingStep> RoutingSteps { get; set; } = new();
        public string RoutingTemplateCode { get; set; } = "";
        public int? RoutingTemplateRevision { get; set; }
    }

    public class PdfLineItem
    {
        public string PartNo { get; set; } = "";
        public string PartDescription { get; set; } = "";
        public string Date { get; set; } = "";
        public string Unit { get; set; } = "EA";
        public int Qty { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal DiscountAmount { get; set; }
        public decimal Amount { get; set; }
        public string Notes { get; set; } = "";
        /// <summary>Qty break unit prices marked Include in Print (shown under the line as price gradation).</summary>
        public List<PdfQtyPriceOption> PrintQtyOptions { get; set; } = new();
    }

    public class PdfQtyPriceOption
    {
        public int Qty { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal DiscountAmount { get; set; }
        public decimal Amount { get; set; }
    }

    public class PdfRoutingStep
    {
        public int Sequence { get; set; }
        public string ProcessName { get; set; } = "";
        public string Description { get; set; } = "";
        public string WorkstationName { get; set; } = "";
        public string TechnicianName { get; set; } = "";
        public int? EstimatedTime { get; set; }
        public string Status { get; set; } = "";
        /// <summary>Shop-floor scan payload (cimmple://jo/{id}/step/{stepId}).</summary>
        public string ScanCode { get; set; } = "";
        /// <summary>Pre-rendered QR PNG for the ScanCode (printed on the router).</summary>
        public byte[]? QrPng { get; set; }
    }
}
































