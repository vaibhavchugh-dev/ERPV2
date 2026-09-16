namespace CimmpleAPI.Services.Pdf
{
    public class DocumentPdfResult
    {
        public byte[] Bytes { get; set; } = Array.Empty<byte>();
        public string FileName { get; set; } = "document.pdf";
        public string DocumentLabel { get; set; } = ""; // e.g. INV-1001, CQ#1000
        public string? DefaultToEmail { get; set; }
        public string? PartyName { get; set; } // customer or vendor name
        public string? Error { get; set; } // set when not found / failed
    }
}
