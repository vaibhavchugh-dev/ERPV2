using Microsoft.AspNetCore.Cryptography.KeyDerivation;
using System.Security.Cryptography;
using System.Text;

namespace CimmpleAPI.Utilities
{
    public static class PasswordHelper
    {
        public static bool VerifyPassword(string? passwordHash, string password)
        {
            if (string.IsNullOrEmpty(passwordHash))
                return false;

            try
            {
                var passwordHashParts = passwordHash.Split('|');
                if (passwordHashParts.Length != 2)
                    return false;

                var salt = Convert.FromBase64String(passwordHashParts[1]);
                var hash = KeyDerivation.Pbkdf2(password, salt, KeyDerivationPrf.HMACSHA512, 10000, 32);
                return passwordHashParts[0].Equals(Convert.ToBase64String(hash));
            }
            catch
            {
                return false;
            }
        }

        public static string GenerateHashedPassword(string password)
        {
            var salt = GetRandomBytes(16);
            var hash = KeyDerivation.Pbkdf2(password, salt, KeyDerivationPrf.HMACSHA512, 10000, 32);
            return Convert.ToBase64String(hash) + '|' + Convert.ToBase64String(salt);
        }

        private static byte[] GetRandomBytes(int length)
        {
            var randomBytes = new byte[length];
            using (var keyGenerator = RandomNumberGenerator.Create())
            {
                keyGenerator.GetBytes(randomBytes);
            }
            return randomBytes;
        }
    }
}
