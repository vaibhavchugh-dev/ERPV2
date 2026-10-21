using System;

namespace CimmpleAPI.Data.Models
{
    /// <summary>One row per client company. Every business table's Tenantid points here.</summary>
    public class Tenant
    {
        public int TenantId { get; set; }
        public string Name { get; set; } = "";

        /// <summary>Short unique code for staff and support (e.g. "ACME").</summary>
        public string? Code { get; set; }

        /// <summary>See <see cref="TenantStatus"/>.</summary>
        public string Status { get; set; } = TenantStatus.Provisioning;

        public string? Plan { get; set; }

        /// <summary>Industry pack code, e.g. machine-shop. Empty when no sample data applies.</summary>
        public string? Industry { get; set; }
        public string? ContactName { get; set; }
        public string? ContactEmail { get; set; }
        public string? Notes { get; set; }

        /// <summary>Version of the default data last applied by the provisioning service.</summary>
        public int SeedVersion { get; set; }

        public string? LastProvisioningError { get; set; }
        public string? CreatedBy { get; set; }
        public DateTime CreatedUtc { get; set; }
        public DateTime? ProvisionedUtc { get; set; }
        public DateTime? StatusChangedUtc { get; set; }
    }

    public static class TenantStatus
    {
        public const string Provisioning = "Provisioning";
        public const string Active = "Active";
        public const string Suspended = "Suspended";
        public const string Cancelled = "Cancelled";

        public static readonly string[] All = { Provisioning, Active, Suspended, Cancelled };

        public static string? Normalize(string? status) =>
            All.FirstOrDefault(s => string.Equals(s, status?.Trim(), StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>One row per master import run from the support portal.</summary>
    public class TenantMasterImport
    {
        public int Id { get; set; }
        public int TenantId { get; set; }
        public string MasterName { get; set; } = "";
        public string Source { get; set; } = "";
        public string? FileName { get; set; }
        public int CreatedCount { get; set; }
        public int UpdatedCount { get; set; }
        public int SkippedCount { get; set; }
        public int FailedCount { get; set; }
        public string? CreatedBy { get; set; }
        public DateTime CreatedUtc { get; set; }
    }
}
