namespace CimmpleAPI.Services
{
    /// <summary>
    /// Maintenance switch controlled by configuration ("Maintenance:Enabled": true in appsettings or the
    /// Maintenance__Enabled environment variable). While enabled, API calls return 503 "under maintenance".
    /// </summary>
    public static class MaintenanceMode
    {
        public const string ResponseMessage = "under maintenance";

        public static bool IsEnabled(IConfiguration configuration) =>
            configuration.GetValue<bool>("Maintenance:Enabled");
    }
}
