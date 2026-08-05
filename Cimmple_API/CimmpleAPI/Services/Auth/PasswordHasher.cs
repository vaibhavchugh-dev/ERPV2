using System.Security.Cryptography;
using System.Text;

namespace CimmpleAPI.Services.Auth
{
    /// <summary>
    /// PBKDF2 password hashing. Stored format: iterations.saltBase64.hashBase64
    /// Also verifies legacy plaintext passwords and upgrades them on successful login.
    /// </summary>
    public static class PasswordHasher
    {
        private const int SaltSize = 16;
        private const int KeySize = 32;
        private const int Iterations = 100_000;
        private const char Separator = '.';

        public static (string hash, string salt) HashPassword(string password)
        {
            var saltBytes = RandomNumberGenerator.GetBytes(SaltSize);
            var hashBytes = Rfc2898DeriveBytes.Pbkdf2(
                Encoding.UTF8.GetBytes(password),
                saltBytes,
                Iterations,
                HashAlgorithmName.SHA256,
                KeySize);

            var salt = Convert.ToBase64String(saltBytes);
            var hash = $"{Iterations}{Separator}{salt}{Separator}{Convert.ToBase64String(hashBytes)}";
            return (hash, salt);
        }

        public static bool Verify(string password, string? storedHash, string? storedSalt, out bool needsUpgrade)
        {
            needsUpgrade = false;
            if (string.IsNullOrEmpty(password) || string.IsNullOrEmpty(storedHash))
            {
                return false;
            }

            // Legacy plaintext (pre-auth implementation)
            if (!storedHash.Contains(Separator) || storedHash.Split(Separator).Length != 3)
            {
                var match = string.Equals(storedHash, password, StringComparison.Ordinal);
                needsUpgrade = match;
                return match;
            }

            var parts = storedHash.Split(Separator);
            if (!int.TryParse(parts[0], out var iterations))
            {
                return false;
            }

            var saltBytes = Convert.FromBase64String(parts[1]);
            var expected = Convert.FromBase64String(parts[2]);
            var actual = Rfc2898DeriveBytes.Pbkdf2(
                Encoding.UTF8.GetBytes(password),
                saltBytes,
                iterations,
                HashAlgorithmName.SHA256,
                expected.Length);

            var ok = CryptographicOperations.FixedTimeEquals(actual, expected);
            needsUpgrade = ok && iterations < Iterations;
            return ok;
        }

        public static bool IsHashed(string? storedHash)
        {
            if (string.IsNullOrEmpty(storedHash)) return false;
            var parts = storedHash.Split(Separator);
            return parts.Length == 3 && int.TryParse(parts[0], out _);
        }
    }
}
