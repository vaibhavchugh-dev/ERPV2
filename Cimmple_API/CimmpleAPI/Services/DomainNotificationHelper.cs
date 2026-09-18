namespace CimmpleAPI.Services
{
    /// <summary>
    /// Soft-fail domain event → inbox helpers (system writers).
    /// </summary>
    public static class DomainNotificationHelper
    {
        public static async Task NotifyUserAsync(
            NotificationService notifications,
            int tenantId,
            int? recipientUserId,
            int? actorUserId,
            string type,
            string title,
            string body,
            string entityType,
            int entityId,
            string linkPath)
        {
            if (notifications == null || tenantId <= 0 || entityId <= 0)
                return;

            var recipient = recipientUserId.GetValueOrDefault();
            if (recipient <= 0)
                return;

            if (actorUserId.HasValue && actorUserId.Value == recipient)
                return;

            try
            {
                await notifications.CreateAsync(new NotificationCreateRequest
                {
                    TenantId = tenantId,
                    RecipientUserId = recipient,
                    ActorUserId = actorUserId,
                    Type = type,
                    Title = title,
                    Body = body,
                    EntityType = entityType,
                    EntityId = entityId,
                    LinkPath = linkPath,
                    SendEmail = false
                });
            }
            catch
            {
                // Soft-fail: domain save must succeed even if notify fails
            }
        }

        public static bool StatusBecame(string? previous, string? next, string target)
        {
            var prev = (previous ?? "").Trim();
            var cur = (next ?? "").Trim();
            if (string.IsNullOrEmpty(cur)) return false;
            if (!string.Equals(cur, target, StringComparison.OrdinalIgnoreCase)) return false;
            return !string.Equals(prev, cur, StringComparison.OrdinalIgnoreCase);
        }
    }
}
