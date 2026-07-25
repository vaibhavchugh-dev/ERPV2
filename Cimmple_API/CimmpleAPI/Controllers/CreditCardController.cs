using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Dtos;
using System;
using System.Collections.Generic;
using System.Linq;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CreditCardController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;

        public CreditCardController(CimmpleDbContext context)
        {
            _context = context;
        }

        [HttpGet("GetCreditCards")]
        public IActionResult GetCreditCards([FromQuery] int tenantid)
        {
            try
            {
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
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetCreditCardById")]
        public IActionResult GetCreditCardById([FromQuery] int creditCardId, [FromQuery] int tenantId)
        {
            try
            {
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
                    cardNumber = creditCard.CardNumber ?? "",
                    lastFourDigits = creditCard.LastFourDigits ?? "",
                    cardholderName = creditCard.CardholderName ?? "",
                    cardType = creditCard.CardType ?? "",
                    expiryMonth = creditCard.ExpiryMonth ?? "",
                    expiryYear = creditCard.ExpiryYear ?? "",
                    cvv = creditCard.CVV ?? "",
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
                    coa = "" // COA column doesn't exist in database table yet
                };

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
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

                if (string.IsNullOrWhiteSpace(request.CardNumber) && request.Id == 0)
                {
                    return BadRequest(new { error = "Card Number is required" });
                }

                CreditCardMaster creditCard;

                if (request.Id > 0)
                {
                    // Update existing credit card
                    creditCard = _context.CreditCardMaster
                        .FirstOrDefault(c => c.Id == request.Id && c.TenantId == request.TenantId);

                    if (creditCard == null)
                    {
                        return NotFound(new { error = "Credit Card not found" });
                    }
                }
                else
                {
                    // Create new credit card
                    creditCard = new CreditCardMaster
                    {
                        TenantId = request.TenantId
                    };
                    _context.CreditCardMaster.Add(creditCard);
                }

                // Update fields
                if (!string.IsNullOrWhiteSpace(request.CardNumber))
                {
                    creditCard.CardNumber = request.CardNumber;
                    // Store last 4 digits for display (remove spaces first)
                    var digitsOnly = request.CardNumber.Replace(" ", "").Replace("-", "");
                    if (digitsOnly.Length >= 4)
                    {
                        creditCard.LastFourDigits = digitsOnly.Substring(digitsOnly.Length - 4);
                    }
                    else
                    {
                        creditCard.LastFourDigits = digitsOnly;
                    }
                }
                else
                {
                    creditCard.CardNumber = "";
                    creditCard.LastFourDigits = "";
                }

                creditCard.CardholderName = request.CardholderName ?? "";
                creditCard.CardType = request.CardType ?? "";
                creditCard.ExpiryMonth = request.ExpiryMonth ?? "";
                creditCard.ExpiryYear = request.ExpiryYear ?? "";
                creditCard.CVV = request.CVV ?? "";
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
                // COA column doesn't exist in database table yet, so skip setting it
                // creditCard.COA = request.COA ?? "";

                _context.SaveChanges();

                return Ok(new { result = new { id = creditCard.Id, message = "Credit Card saved successfully" } });
            }
            catch (Exception ex)
            {
                // Log inner exception if available
                var errorMessage = ex.Message;
                if (ex.InnerException != null)
                {
                    errorMessage += " | Inner Exception: " + ex.InnerException.Message;
                }
                return StatusCode(500, new { error = errorMessage, stackTrace = ex.StackTrace });
            }
        }

        [HttpGet("CheckCreditCardDeletionImpact")]
        public IActionResult CheckCreditCardDeletionImpact([FromQuery] int creditCardId, [FromQuery] int tenantId)
        {
            try
            {
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
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpDelete("DeleteCreditCard")]
        public IActionResult DeleteCreditCard([FromQuery] int creditCardId, [FromQuery] int tenantId)
        {
            try
            {
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
                return StatusCode(500, new { error = ex.Message });
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

