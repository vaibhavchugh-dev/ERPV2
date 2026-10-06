using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Dtos;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CreditCardController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;
        private readonly ILogger<CreditCardController> _logger;
        private static bool _coaColumnEnsured;
        private static bool _sensitiveDataPurged;

        public CreditCardController(CimmpleDbContext context, ILogger<CreditCardController> logger)
        {
            _context = context;
            _logger = logger;
        }

        private IActionResult ServerError(Exception ex, string action)
        {
            _logger.LogError(ex, "Credit card {Action} failed", action);
            return StatusCode(500, new { error = "An unexpected error occurred. Please try again." });
        }

        private static string Masked(string? lastFour) =>
            string.IsNullOrEmpty(lastFour) ? "****" : "****" + lastFour;

        /// <summary>
        /// Full card numbers and CVVs must never be kept. Older rows stored both in plaintext; reduce them to
        /// the masked last four digits once per process.
        /// </summary>
        private void PurgeSensitiveCardData()
        {
            if (_sensitiveDataPurged) return;
            _context.Database.ExecuteSqlRaw(@"
UPDATE CimmpleFlow.CreditCardMaster
SET LastFourDigits = CASE
        WHEN (LastFourDigits IS NULL OR LastFourDigits = '') AND LEN(REPLACE(REPLACE(ISNULL(CardNumber, ''), ' ', ''), '-', '')) >= 4
            THEN RIGHT(REPLACE(REPLACE(CardNumber, ' ', ''), '-', ''), 4)
        ELSE LastFourDigits END,
    CardNumber = CASE
        WHEN CardNumber IS NULL OR CardNumber = '' OR CardNumber LIKE '****%' THEN CardNumber
        ELSE '****' + RIGHT(REPLACE(REPLACE(CardNumber, ' ', ''), '-', ''), 4) END,
    CVV = ''
WHERE (CVV IS NOT NULL AND CVV <> '')
   OR (CardNumber IS NOT NULL AND CardNumber <> '' AND CardNumber NOT LIKE '****%');");
            _sensitiveDataPurged = true;
        }

        // Same rules as Common/Utils/validation.ts.
        private static readonly Regex EmailPattern = new(@"^[^\s@]+@[^\s@]+\.[^\s@]+$");
        private static readonly Regex ZipPattern = new(@"^[0-9]{5}(-[0-9]{4})?$|^[A-Z0-9]{3,10}$", RegexOptions.IgnoreCase);
        private static readonly Regex CvvPattern = new(@"^[0-9]{3,4}$");

        private static string ExpiryKey(string? month, string? year) =>
            $"{(int.TryParse(month?.Trim(), out var m) ? m : 0):00}/{year?.Trim()}";

        private static bool PassesLuhn(string digits)
        {
            int sum = 0;
            bool doubleIt = false;
            for (int i = digits.Length - 1; i >= 0; i--)
            {
                int d = digits[i] - '0';
                if (doubleIt) { d *= 2; if (d > 9) d -= 9; }
                sum += d;
                doubleIt = !doubleIt;
            }
            return sum % 10 == 0;
        }

        /// <summary>
        /// Validates the request and returns the normalised card digits (null when the number is unchanged).
        /// Expiry must not be in the past for a new card or when the expiry is being changed, so an expired
        /// card can still be deactivated or have its billing details edited.
        /// </summary>
        private static string? ValidateRequest(CreditCardMasterReq r, CreditCardMaster? existing, out string? cardDigits, out string? month, out string? year)
        {
            cardDigits = null;
            month = null;
            year = null;
            bool isNew = existing == null;

            var rawNumber = (r.CardNumber ?? "").Trim();
            if (rawNumber.StartsWith("*")) rawNumber = "";
            if (rawNumber.Length > 0)
            {
                var digits = rawNumber.Replace(" ", "").Replace("-", "");
                if (!digits.All(char.IsDigit) || digits.Length < 13 || digits.Length > 19 || !PassesLuhn(digits))
                    return "Please enter a valid card number";
                cardDigits = digits;
            }
            else if (isNew)
            {
                return "Card Number is required";
            }

            if (!string.IsNullOrWhiteSpace(r.CVV) && !CvvPattern.IsMatch(r.CVV.Trim()))
                return "CVV must be 3 or 4 digits";

            var m = (r.ExpiryMonth ?? "").Trim();
            var y = (r.ExpiryYear ?? "").Trim();
            if (isNew && (m.Length == 0 || y.Length == 0))
                return "Expiry month and year are required";
            if (m.Length > 0)
            {
                if (!int.TryParse(m, out var mi) || mi < 1 || mi > 12) return "Expiry month must be between 01 and 12";
                m = mi.ToString("00");
            }
            if (y.Length > 0 && (y.Length != 4 || !int.TryParse(y, out _)))
                return "Expiry year must be a 4-digit year";

            month = m.Length > 0 ? m : existing?.ExpiryMonth ?? "";
            year = y.Length > 0 ? y : existing?.ExpiryYear ?? "";
            var expiryChanged = isNew
                || ExpiryKey(month, year) != ExpiryKey(existing!.ExpiryMonth, existing.ExpiryYear);
            if (expiryChanged && int.TryParse(month, out var em) && int.TryParse(year, out var ey))
            {
                var now = DateTime.Now;
                if (ey < now.Year || (ey == now.Year && em < now.Month))
                    return "Card has expired";
            }

            if (!string.IsNullOrWhiteSpace(r.Email) && !EmailPattern.IsMatch(r.Email.Trim()))
                return "Please enter a valid email address";
            if (!string.IsNullOrWhiteSpace(r.Phone))
            {
                var phoneDigits = r.Phone.Count(char.IsDigit);
                if (phoneDigits < 10 || phoneDigits > 15) return "Please enter a valid phone number (10-15 digits)";
            }
            if (!string.IsNullOrWhiteSpace(r.BillingZip) && !ZipPattern.IsMatch(r.BillingZip.Trim()))
                return "Please enter a valid zip/postal code";

            return null;
        }

        /// <summary>
        /// CreditCardMaster lives in CimmpleFlow; older DBs were created without COA.
        /// Ensure the column exists before any EF query that maps it.
        /// </summary>
        private void EnsureCoaColumnExists()
        {
            PurgeSensitiveCardData();
            if (_coaColumnEnsured) return;
            try
            {
                _context.Database.ExecuteSqlRaw(@"
IF COL_LENGTH('CimmpleFlow.CreditCardMaster', 'COA') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.CreditCardMaster ADD COA nvarchar(100) NULL;
END
IF COL_LENGTH('dbo.CreditCardMaster', 'COA') IS NULL
   AND OBJECT_ID(N'dbo.CreditCardMaster', N'U') IS NOT NULL
BEGIN
    ALTER TABLE dbo.CreditCardMaster ADD COA nvarchar(100) NULL;
END
");
                _coaColumnEnsured = true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"EnsureCoaColumnExists: {ex.Message}");
                // Still mark attempted so we don't loop; subsequent query may surface the real error
                _coaColumnEnsured = true;
            }
        }

        [HttpGet("GetCreditCards")]
        public IActionResult GetCreditCards([FromQuery] int tenantid)
        {
            try
            {
                EnsureCoaColumnExists();
                var creditCards = _context.CreditCardMaster
                    .Where(c => c.TenantId == tenantid)
                    .Select(c => new
                    {
                        id = c.Id,
                        cardNumber = c.LastFourDigits != null && c.LastFourDigits.Length > 0
                            ? "****" + c.LastFourDigits
                            : "****",
                        cardholderName = c.CardholderName ?? "",
                        cardType = c.CardType ?? "",
                        expiryMonth = c.ExpiryMonth ?? "",
                        expiryYear = c.ExpiryYear ?? "",
                        nickName = c.NickName ?? "",
                        status = c.Status,
                        statusText = c.Status == 1 ? "Active" : "Inactive",
                        isPrimary = c.IsPrimary ?? false
                    })
                    .ToList();

                return Ok(new { result = creditCards });
            }
            catch (Exception ex)
            {
                return ServerError(ex, "list");
            }
        }

        [HttpGet("GetCreditCardById")]
        public IActionResult GetCreditCardById([FromQuery] int creditCardId, [FromQuery] int tenantId)
        {
            try
            {
                EnsureCoaColumnExists();
                var creditCard = _context.CreditCardMaster
                    .Where(c => c.Id == creditCardId && c.TenantId == tenantId)
                    .FirstOrDefault();

                if (creditCard == null)
                {
                    return NotFound(new { error = "Credit Card not found" });
                }

                var result = new
                {
                    id = creditCard.Id,
                    cardNumber = Masked(creditCard.LastFourDigits),
                    lastFourDigits = creditCard.LastFourDigits ?? "",
                    cardholderName = creditCard.CardholderName ?? "",
                    cardType = creditCard.CardType ?? "",
                    expiryMonth = creditCard.ExpiryMonth ?? "",
                    expiryYear = creditCard.ExpiryYear ?? "",
                    billingStreet = creditCard.BillingStreet ?? "",
                    billingApartment = creditCard.BillingApartment ?? "",
                    billingCity = creditCard.BillingCity ?? "",
                    billingState = creditCard.BillingState ?? "",
                    billingZip = creditCard.BillingZip ?? "",
                    billingCountry = creditCard.BillingCountry ?? "US",
                    phone = creditCard.Phone ?? "",
                    email = creditCard.Email ?? "",
                    status = creditCard.Status,
                    statusText = creditCard.Status == 1 ? "Active" : "Inactive",
                    tenantId = creditCard.TenantId,
                    nickName = creditCard.NickName ?? "",
                    isPrimary = creditCard.IsPrimary ?? false,
                    coa = creditCard.COA ?? ""
                };

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                return ServerError(ex, "get");
            }
        }

        [HttpPost("SaveCreditCard")]
        public IActionResult SaveCreditCard([FromBody] CreditCardMasterReq request)
        {
            try
            {
                if (request == null)
                {
                    return BadRequest(new { error = "Request is null" });
                }

                // Validate required fields
                if (string.IsNullOrWhiteSpace(request.CardholderName))
                {
                    return BadRequest(new { error = "Cardholder Name is required" });
                }

                EnsureCoaColumnExists();
                CreditCardMaster? existing = null;
                if (request.Id > 0)
                {
                    existing = _context.CreditCardMaster
                        .FirstOrDefault(c => c.Id == request.Id && c.TenantId == request.TenantId);

                    if (existing == null)
                    {
                        return NotFound(new { error = "Credit Card not found" });
                    }
                }

                var validationError = ValidateRequest(request, existing, out var cardDigits, out var expiryMonth, out var expiryYear);
                if (validationError != null)
                {
                    return BadRequest(new { error = validationError });
                }

                var creditCard = existing ?? new CreditCardMaster { TenantId = request.TenantId };
                if (existing == null)
                {
                    _context.CreditCardMaster.Add(creditCard);
                }

                if (cardDigits != null)
                {
                    creditCard.LastFourDigits = cardDigits.Substring(cardDigits.Length - 4);
                    creditCard.CardNumber = Masked(creditCard.LastFourDigits);
                }

                creditCard.CardholderName = request.CardholderName.Trim();
                creditCard.CardType = request.CardType ?? "";
                creditCard.ExpiryMonth = expiryMonth ?? "";
                creditCard.ExpiryYear = expiryYear ?? "";
                creditCard.CVV = "";
                creditCard.BillingStreet = request.BillingStreet ?? "";
                creditCard.BillingApartment = request.BillingApartment ?? "";
                creditCard.BillingCity = request.BillingCity ?? "";
                creditCard.BillingState = request.BillingState ?? "";
                creditCard.BillingZip = request.BillingZip ?? "";
                creditCard.BillingCountry = request.BillingCountry ?? "US";
                creditCard.Phone = request.Phone ?? "";
                creditCard.Email = request.Email ?? "";
                creditCard.Status = request.Status == "Active" ? 1 : 0;
                creditCard.NickName = request.NickName ?? "";
                creditCard.IsPrimary = request.IsPrimary;
                creditCard.COA = request.COA ?? "";

                _context.SaveChanges();

                return Ok(new { result = new { id = creditCard.Id, message = "Credit Card saved successfully" } });
            }
            catch (Exception ex)
            {
                return ServerError(ex, "save");
            }
        }

        [HttpGet("CheckCreditCardDeletionImpact")]
        public IActionResult CheckCreditCardDeletionImpact([FromQuery] int creditCardId, [FromQuery] int tenantId)
        {
            try
            {
                EnsureCoaColumnExists();
                var creditCard = _context.CreditCardMaster
                    .FirstOrDefault(c => c.Id == creditCardId && c.TenantId == tenantId);

                if (creditCard == null)
                {
                    return NotFound(new { error = "Credit Card not found" });
                }

                var result = new DeletionImpactResult
                {
                    CanDelete = true,
                    BlockingReasons = new List<string>(),
                    BlockingDependencies = new List<BlockingDependency>(),
                    WillBeDeleted = new List<ImpactedEntity>(),
                    WillBeAffected = new List<ImpactedEntity>(),
                    Warnings = new List<string>()
                };

                // Credit cards may be referenced in transactions, but we don't have a direct FK
                // For now, we'll allow deletion but warn if there are any potential references
                // In a full implementation, you might want to check transaction payment methods

                if (!result.CanDelete)
                {
                    result.BlockingReasons.Add("This Credit Card is referenced by transactions or other entities.");
                }

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                return ServerError(ex, "deletion impact");
            }
        }

        [HttpDelete("DeleteCreditCard")]
        public IActionResult DeleteCreditCard([FromQuery] int creditCardId, [FromQuery] int tenantId)
        {
            try
            {
                EnsureCoaColumnExists();
                var creditCard = _context.CreditCardMaster
                    .FirstOrDefault(c => c.Id == creditCardId && c.TenantId == tenantId);

                if (creditCard == null)
                {
                    return NotFound(new { error = "Credit Card not found" });
                }

                // Delete the credit card
                _context.CreditCardMaster.Remove(creditCard);
                _context.SaveChanges();

                return Ok(new { result = new { message = "Credit Card deleted successfully" } });
            }
            catch (Exception ex)
            {
                return ServerError(ex, "delete");
            }
        }
    }

    public class CreditCardMasterReq
    {
        public int Id { get; set; }
        public int TenantId { get; set; }
        public string CardNumber { get; set; } = "";
        public string CardholderName { get; set; } = "";
        public string CardType { get; set; } = "";
        public string ExpiryMonth { get; set; } = "";
        public string ExpiryYear { get; set; } = "";
        public string CVV { get; set; } = "";
        public string BillingStreet { get; set; } = "";
        public string BillingApartment { get; set; } = "";
        public string BillingCity { get; set; } = "";
        public string BillingState { get; set; } = "";
        public string BillingZip { get; set; } = "";
        public string BillingCountry { get; set; } = "US";
        public string Phone { get; set; } = "";
        public string Email { get; set; } = "";
        public string Status { get; set; } = "Active";
        public string NickName { get; set; } = "";
        public bool IsPrimary { get; set; } = false;
        public string COA { get; set; } = "";
    }
}
