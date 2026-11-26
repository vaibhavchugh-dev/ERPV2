namespace CimmpleAPI.Services.Tenancy
{
    /// <summary>Settings for self-service trial signup ("Signup" section of appsettings).</summary>
    public class SignupOptions
    {
        public const string SectionName = "Signup";

        /// <summary>Turns the public signup endpoint on or off.</summary>
        public bool Enabled { get; set; } = true;

        /// <summary>Length of the free trial. Use 1 to test expiry quickly.</summary>
        public int TrialDays { get; set; } = 90;

        /// <summary>Signups accepted from one IP address per hour.</summary>
        public int MaxRequestsPerIpPerHour { get; set; } = 5;

        /// <summary>Provisioning attempts before a signup is marked Failed for support to handle.</summary>
        public int MaxAttempts { get; set; } = 5;

        public int EffectiveTrialDays => Math.Clamp(TrialDays, 1, 365);
    }
}
