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
    }
}
