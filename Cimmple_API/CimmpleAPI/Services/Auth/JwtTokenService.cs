using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace CimmpleAPI.Services.Auth
{
    public interface IJwtTokenService
    {
        (string token, DateTime expiresAtUtc) CreateAccessToken(IEnumerable<Claim> claims, int? sessionTimeoutMinutes = null);
        string CreateRefreshToken();
        ClaimsPrincipal? ValidateToken(string token, bool validateLifetime = true);
    }

    public class JwtTokenService : IJwtTokenService
    {
        private readonly TokenConfigOptions _options;
        private readonly byte[] _keyBytes;

        public JwtTokenService(IOptions<TokenConfigOptions> options)
        {
            _options = options.Value;
            _keyBytes = Encoding.UTF8.GetBytes(_options.Key);
            if (_keyBytes.Length < 32)
            {
                // Pad short keys so SymmetricSecurityKey doesn't fail in dev
                Array.Resize(ref _keyBytes, 32);
            }
        }

        public (string token, DateTime expiresAtUtc) CreateAccessToken(IEnumerable<Claim> claims, int? sessionTimeoutMinutes = null)
        {
            var minutes = sessionTimeoutMinutes is > 0
                ? sessionTimeoutMinutes.Value
                : (_options.AccessTokenMinutes > 0 ? _options.AccessTokenMinutes : 60);

            var expires = DateTime.UtcNow.AddMinutes(minutes);
            var credentials = new SigningCredentials(
                new SymmetricSecurityKey(_keyBytes),
                SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(
                issuer: _options.Issuer,
                audience: _options.Audience,
                claims: claims,
                notBefore: DateTime.UtcNow,
                expires: expires,
                signingCredentials: credentials);

            return (new JwtSecurityTokenHandler().WriteToken(token), expires);
        }

        public string CreateRefreshToken()
        {
            return Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
        }

        public ClaimsPrincipal? ValidateToken(string token, bool validateLifetime = true)
        {
            var handler = new JwtSecurityTokenHandler();
            try
            {
                return handler.ValidateToken(token, new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = _options.Issuer,
                    ValidateAudience = true,
                    ValidAudience = _options.Audience,
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(_keyBytes),
                    ValidateLifetime = validateLifetime,
                    ClockSkew = TimeSpan.FromMinutes(1)
                }, out _);
            }
            catch
            {
                return null;
            }
        }
    }
}
