namespace CimmpleAPI.Services.Auth
{
    public class TokenConfigOptions
    {
        public const string SectionName = "TokenConfig";

        public string Key { get; set; } = "ChangeThisToALongSecureSecretKeyAtLeast32Chars!";
        public string Issuer { get; set; } = "CimmpleAPI";
        public string Audience { get; set; } = "CimmpleUI";
        public int AccessTokenMinutes { get; set; } = 60;
        public int RefreshTokenDays { get; set; } = 7;

        /// <summary>Client id for machine-to-machine callers (e.g. CimmplePay).</summary>
        public string? IntegrationClientId { get; set; }

        /// <summary>Client secret for machine-to-machine callers. Server-only; never commit real values.</summary>
        public string? IntegrationClientSecret { get; set; }

        /// <summary>TTL for integration JWTs minted via /api/Auth/IntegrationToken. Default 10 minutes.</summary>
        public int IntegrationTokenMinutes { get; set; } = 10;
    }
}
