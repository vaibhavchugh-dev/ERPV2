namespace CimmpleAPI.Data
{
    /// <summary>
    /// SQL schemas in CimmpleERPDB.
    /// This ERP API owns Flow. Punch tables are read/written by attendance endpoints.
    /// </summary>
    public static class DbSchema
    {
        public const string Flow = "CimmpleFlow";
        public const string Punch = "CimmplePunch";
        /// <summary>Owned by CimmplePay. Read/written for kiosk → Time &amp; Attendance dual-write.</summary>
        public const string Pay = "CimmplePay";
    }
}
