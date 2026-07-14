using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    public class SystemSettings
    {
        [Key]
        public int Id { get; set; }
        public int TenantId { get; set; }
        
        // Date & Time Settings
        public string DateFormat { get; set; } = "M/d/yyyy";
        public string TimeFormat { get; set; } = "12"; // 12 or 24 hour
        public string Timezone { get; set; } = "America/New_York";
        public string Locale { get; set; } = "en-US";
        
        // Currency Settings
        public string DefaultCurrency { get; set; } = "USD";
        public string CurrencySymbol { get; set; } = "$";
        public int DecimalPlaces { get; set; } = 2;
        
        // Number Formatting
        public string DecimalSeparator { get; set; } = ".";
        public string ThousandsSeparator { get; set; } = ",";
        
        // Security Settings
        public int MinPasswordLength { get; set; } = 8;
        public bool RequireUppercase { get; set; } = true;
        public bool RequireLowercase { get; set; } = true;
        public bool RequireNumbers { get; set; } = true;
        public bool RequireSpecialChars { get; set; } = false;
        public int PasswordExpirationDays { get; set; } = 90;
        public int PasswordHistoryCount { get; set; } = 5;
        public int SessionTimeoutMinutes { get; set; } = 30;
        public int MaxConcurrentSessions { get; set; } = 3;
        public int FailedLoginAttempts { get; set; } = 5;
        public int AccountLockoutMinutes { get; set; } = 15;
        
        // Email/SMTP Settings
        public string SmtpServer { get; set; } = "";
        public int SmtpPort { get; set; } = 587;
        public bool SmtpUseSsl { get; set; } = true;
        public string SmtpUsername { get; set; } = "";
        public string SmtpPassword { get; set; } = "";
        public string SmtpFromEmail { get; set; } = "";
        public string SmtpFromName { get; set; } = "";
        
        // System Preferences
        public int DefaultPageSize { get; set; } = 10;
        public bool EnableEmailNotifications { get; set; } = true;
        public bool EnableInAppNotifications { get; set; } = true;
        
        // Timestamps
        public DateTime? CreatedDate { get; set; }
        public DateTime? UpdatedDate { get; set; }
    }
}

















