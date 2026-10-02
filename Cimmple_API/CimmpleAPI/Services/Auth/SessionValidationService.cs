using CimmpleAPI.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace CimmpleAPI.Services.Auth
{
    public interface ISessionValidationService
    {
        Task<bool> IsSessionActiveAsync(int sessionId, int userId);
        void Invalidate(int sessionId);
    }

    /// <summary>
    /// Checks that the login session referenced by a JWT "sid" claim is still active
    /// (not logged out, evicted by Max Concurrent Sessions, or expired).
    /// </summary>
    public class SessionValidationService : ISessionValidationService
    {
        private static readonly TimeSpan CacheDuration = TimeSpan.FromSeconds(30);
        private readonly CimmpleDbContext _db;
        private readonly IMemoryCache _cache;

        public SessionValidationService(CimmpleDbContext db, IMemoryCache cache)
        {
            _db = db;
            _cache = cache;
        }

        public async Task<bool> IsSessionActiveAsync(int sessionId, int userId)
        {
            var key = CacheKey(sessionId);
            if (_cache.TryGetValue(key, out bool cached))
            {
                return cached;
            }

            var now = DateTime.UtcNow;
            var active = await _db.UserInfo.AsNoTracking()
                .AnyAsync(s => s.UserID == sessionId
                    && s.User_UniqueID == userId
                    && s.LogInStatus == 1
                    && s.RefreshTokenHash != null
                    && (s.RefreshExpiresUtc == null || s.RefreshExpiresUtc > now));

            _cache.Set(key, active, CacheDuration);
            return active;
        }

        public void Invalidate(int sessionId)
        {
            _cache.Remove(CacheKey(sessionId));
        }

        private static string CacheKey(int sessionId) => $"auth-session:{sessionId}";
    }
}
