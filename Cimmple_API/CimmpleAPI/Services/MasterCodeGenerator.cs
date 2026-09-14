using System;
using System.Collections.Generic;
using System.Linq;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Generates sequential master codes (C1001, V1001, …) from the highest
    /// existing numeric suffix so deleted codes are not reused and gaps do not collide.
    /// </summary>
    public static class MasterCodeGenerator
    {
        public static int GetNextSequence(IEnumerable<string?> existingCodes, char prefix, int startAt = 1001)
        {
            var max = startAt - 1;
            var prefixStr = prefix.ToString();
            foreach (var code in existingCodes)
            {
                if (string.IsNullOrWhiteSpace(code))
                    continue;
                var trimmed = code.Trim();
                if (trimmed.Length < 2)
                    continue;
                if (!trimmed.StartsWith(prefixStr, StringComparison.OrdinalIgnoreCase))
                    continue;
                if (int.TryParse(trimmed.Substring(1), out var n) && n > max)
                    max = n;
            }
            return max + 1;
        }

        public static string NextCode(IEnumerable<string?> existingCodes, char prefix, int startAt = 1001) =>
            $"{prefix}{GetNextSequence(existingCodes, prefix, startAt)}";
    }
}
