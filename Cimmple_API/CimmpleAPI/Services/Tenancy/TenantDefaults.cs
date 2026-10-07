using CimmpleAPI.Data.Models;

namespace CimmpleAPI.Services.Tenancy
{
    /// <summary>Default rows every tenant starts with. Shared by provisioning and the screens that create them lazily.</summary>
    public static class TenantDefaults
    {
        public const string DefaultTimeZone = "America/New_York";
        public const string DefaultCurrency = "USD";
        public const string DefaultCurrencySymbol = "$";

        /// <summary>Role names line up with the default AP approval limits (AccountingDefaultsSeed).</summary>
        public static readonly (string Name, string Tag, int OrderNo)[] Roles =
        {
            ("Admin", "ADMIN", 1),
            ("Manager", "MANAGER", 2),
            ("Supervisor", "SUPERVISOR", 3),
            ("Staff", "STAFF", 4)
        };

        public const string AdminRoleName = "Admin";
        public const string MainSiteName = "Main Site";
        public const string MainSiteCode = "MAIN";

        public static SystemSettings CreateSystemSettings(int tenantId, string? timeZone = null, string? currency = null, string? currencySymbol = null)
        {
            var now = DateTime.UtcNow;
            return new SystemSettings
            {
                TenantId = tenantId,
                DateFormat = "M/d/yyyy",
                TimeFormat = "12",
                Timezone = string.IsNullOrWhiteSpace(timeZone) ? DefaultTimeZone : timeZone.Trim(),
                Locale = "en-US",
                DefaultCurrency = string.IsNullOrWhiteSpace(currency) ? DefaultCurrency : currency.Trim().ToUpperInvariant(),
                CurrencySymbol = string.IsNullOrWhiteSpace(currencySymbol) ? DefaultCurrencySymbol : currencySymbol.Trim(),
                DecimalPlaces = 2,
                DecimalSeparator = ".",
                ThousandsSeparator = ",",
                MinPasswordLength = 8,
                RequireUppercase = true,
                RequireLowercase = true,
                RequireNumbers = true,
                RequireSpecialChars = false,
                PasswordExpirationDays = 90,
                PasswordHistoryCount = 5,
                SessionTimeoutMinutes = 30,
                MaxConcurrentSessions = 3,
                FailedLoginAttempts = 5,
                AccountLockoutMinutes = 15,
                EmailDeliveryMode = SmtpSettingsResolver.ModeHosted,
                SmtpPort = 587,
                SmtpUseSsl = true,
                DefaultPageSize = 10,
                EnableEmailNotifications = true,
                EnableInAppNotifications = true,
                CreatedDate = now,
                UpdatedDate = now
            };
        }

        public static EntityMaster CreateCompanyProfile(
            int tenantId,
            string? companyName,
            string? email,
            string? phone = null,
            string? country = null,
            string? timeZone = null,
            string? webAddress = null,
            string? address = null,
            string? city = null,
            string? state = null,
            string? zip = null)
        {
            var tz = string.IsNullOrWhiteSpace(timeZone) ? DefaultTimeZone : timeZone.Trim();
            return new EntityMaster
            {
                Tenantid = tenantId,
                company_name = companyName?.Trim() ?? "",
                email = email?.Trim() ?? "",
                phone_number = phone?.Trim() ?? "",
                address = address?.Trim() ?? "",
                city = city?.Trim() ?? "",
                state = state?.Trim() ?? "",
                zip = zip?.Trim() ?? "",
                country = country?.Trim() ?? "",
                WebAddress = webAddress?.Trim() ?? "",
                registration_date = DateTime.UtcNow,
                first_name = "",
                last_name = "",
                pointofcontact = "",
                ContactEmail = email?.Trim() ?? "",
                apartment = "",
                entitycode = "",
                SaleTax = 0,
                QuotationPrefix = "QT",
                CustomerPrefix = "C",
                VendorPrefix = "V",
                ShippingPrefix = "SH",
                InvoicePrefix = "INV",
                timezoneui = tz,
                timezone = tz,
                coacount = 0
            };
        }

        public static Location CreateMainSite(int tenantId, EntityMaster? company) => new Location
        {
            TenantId = tenantId,
            Name = MainSiteName,
            Code = MainSiteCode,
            Address = company?.address ?? "",
            Region = company?.apartment ?? "",
            city = company?.city ?? "",
            state = company?.state ?? "",
            zip = company?.zip ?? "",
            email = company?.email ?? "",
            webaddress = company?.WebAddress ?? "",
            phone = company?.phone_number ?? "",
            Country = company?.country ?? "",
            Status = "Active",
            LocType = LocationKind.BusinessSite
        };
    }
}
