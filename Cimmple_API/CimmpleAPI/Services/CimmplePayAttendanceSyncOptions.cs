namespace CimmpleAPI.Services
{
    /// <summary>
    /// Optional HTTP dual-write to CimmplePay. When BaseUrl is empty, sync uses the shared DB.
    /// </summary>
    public class CimmplePayAttendanceSyncOptions
    {
        public const string SectionName = "CimmplePay";

        /// <summary>CimmplePay API root, e.g. https://pay-api.example.com/ or http://localhost:5282/</summary>
        public string BaseUrl { get; set; } = string.Empty;

        /// <summary>Must match Pay KioskPunch:IntegrationKey when using HTTP.</summary>
        public string IntegrationKey { get; set; } = string.Empty;

        public int TimeoutSeconds { get; set; } = 30;

        /// <summary>When false, successful punches are not mirrored to CimmplePay.</summary>
        public bool SyncAttendanceEnabled { get; set; } = true;
    }
}
