using QRCoder;

namespace CimmpleAPI.Services.Pdf
{
    /// <summary>Generates PNG QR images for shop-floor scan codes on printed routers.</summary>
    public static class QrCodeHelper
    {
        public static byte[]? GeneratePng(string? content, int pixelsPerModule = 4)
        {
            if (string.IsNullOrWhiteSpace(content))
                return null;

            using var generator = new QRCodeGenerator();
            using var data = generator.CreateQrCode(content, QRCodeGenerator.ECCLevel.Q);
            var qrCode = new PngByteQRCode(data);
            return qrCode.GetGraphic(pixelsPerModule);
        }

        /// <summary>Stable scan payload matching office/PWA: cimmple://jo/{jobOrderId}/step/{stepId}</summary>
        public static string BuildStepScanCode(int jobOrderId, int stepId) =>
            $"cimmple://jo/{jobOrderId}/step/{stepId}";
    }
}
