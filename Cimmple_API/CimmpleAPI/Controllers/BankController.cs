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
    public class BankController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;

        public BankController(CimmpleDbContext context)
        {
            _context = context;
        }

        [HttpGet("GetBanklist")]
        public IActionResult GetBanklist([FromQuery] int tenantid, [FromQuery] int? locationId = null)
        {
            try
            {
                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid))
                    return forbid!;

                var query = _context.BankMaster.Where(b => b.TenantId == tenantid);
                if (filterLocationId.HasValue)
                {
                    query = query.Where(b => b.locationId == filterLocationId.Value);
                }

                var banks = query
                    .Select(b => new
                    {
                        id = b.Id,
                        bankName = b.BankName,
                        accountNo = b.lastAccountNo ?? "XXXX",
                        accountType = b.AccountType,
                        phone = b.Phone,
                        email = b.Email,
                        status = b.status ?? "Active",
                        balance = b.Balance,
                        routingNumber = b.RoutingNumber,
                        nickName = b.NickName
                    })
                    .ToList();

                return Ok(new { result = banks });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetBankById")]
        public IActionResult GetBankById([FromQuery] int bankId, [FromQuery] int tenantId)
        {
            try
            {
                var bank = _context.BankMaster
                    .Where(b => b.Id == bankId && b.TenantId == tenantId)
                    .FirstOrDefault();

                if (bank == null)
                {
                    return NotFound(new { error = "Bank not found" });
                }

                var result = new
                {
                    id = bank.Id,
                    bankName = bank.BankName,
                    accountNo = bank.AccountNo,
                    lastAccountNo = bank.lastAccountNo,
                    accountType = bank.AccountType,
                    routingNumber = bank.RoutingNumber,
                    phone = bank.Phone,
                    email = bank.Email,
                    street = bank.street,
                    apartment = bank.apartment ?? string.Empty,
                    city = bank.city,
                    state = bank.state,
                    zip = bank.zip,
                    country = bank.country ?? "US",
                    balance = bank.Balance,
                    startingcheck = bank.startingcheck,
                    checkseries = bank.checkseries,
                    coa = bank.coa,
                    nickName = bank.NickName,
                    status = bank.status ?? "Active",
                    isprimary = bank.isprimary ?? false,
                    ispayrollDefault = bank.ispayrollDefault ?? false,
                    TenantId = bank.TenantId,
                    locationId = bank.locationId,
                    sharingid = bank.sharingid ?? 0
                };

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("SaveBankData")]
        public IActionResult SaveBankData([FromBody] BankMasterReq request)
        {
            try
            {
                if (!TryResolveLocationId(request.locationId > 0 ? request.locationId : null, out var resolvedLocationId, out var forbid))
                    return forbid!;
                request.locationId = resolvedLocationId;

                // Validate required fields
                if (string.IsNullOrWhiteSpace(request.BankName))
                {
                    return BadRequest(new { error = "Bank Name is required" });
                }

                if (string.IsNullOrWhiteSpace(request.AccountNo) && request.Id == 0)
                {
                    return BadRequest(new { error = "Account No is required" });
                }

                if (string.IsNullOrWhiteSpace(request.NickName))
                {
                    return BadRequest(new { error = "Short Name is required" });
                }

                if (!request.startingcheck.HasValue)
                {
                    return BadRequest(new { error = "Starting Check No is required" });
                }

                if (string.IsNullOrWhiteSpace(request.checkseries))
                {
                    return BadRequest(new { error = "Check Series is required" });
                }

                // COA is optional - only validate length if provided
                if (!string.IsNullOrWhiteSpace(request.coa) && request.coa.Length != 4)
                {
                    return BadRequest(new { error = "COA must be exactly 4 characters" });
                }

                var existingBank = _context.BankMaster
                    .FirstOrDefault(b => b.Id == request.Id && b.TenantId == request.TenantID);

                BankMaster bank;
                bool isNew = existingBank == null;

                if (isNew)
                {
                    // Check for duplicate Account No / Routing Number
                    var duplicate = _context.BankMaster
                        .Any(b => b.TenantId == request.TenantID &&
                                 b.locationId == request.locationId &&
                                 (b.RoutingNumber == request.RoutingNumber || 
                                  b.AccountNo == request.AccountNo));

                    if (duplicate)
                    {
                        return BadRequest(new { error = "Account no. / Routing no already exists", accountNo = "duplicate" });
                    }

                    // Check for duplicate COA (only if COA is provided)
                    if (!string.IsNullOrWhiteSpace(request.coa))
                    {
                        var duplicateCOA = _context.BankMaster
                            .Any(b => b.TenantId == request.TenantID && b.coa == request.coa);

                        if (duplicateCOA)
                        {
                            return BadRequest(new { error = "COA already exists", coa = "duplicate" });
                        }
                    }

                    bank = new BankMaster();
                    // Initialize required fields that may not be in the request (required by database schema)
                    bank.accountname = string.Empty;
                    bank.displayname = string.Empty;
                    bank.Bankcode = string.Empty;
                    bank.BankStreet1 = string.Empty;
                    bank.BankStreet2 = string.Empty;
                }
                else
                {
                    bank = existingBank;

                    // Check for duplicate Account No / Routing Number (excluding current bank)
                    if (bank.AccountNo != request.AccountNo || bank.RoutingNumber != request.RoutingNumber)
                    {
                        var duplicate = _context.BankMaster
                            .Any(b => b.Id != request.Id &&
                                     b.TenantId == request.TenantID &&
                                     b.locationId == request.locationId &&
                                     (b.RoutingNumber == request.RoutingNumber || 
                                      b.AccountNo == request.AccountNo));

                        if (duplicate)
                        {
                            return BadRequest(new { error = "Account no. / Routing no already exists", accountNo = "duplicate" });
                        }
                    }

                    // Check for duplicate COA (excluding current bank)
                    if (bank.coa != request.coa)
                    {
                        var duplicateCOA = _context.BankMaster
                            .Any(b => b.Id != request.Id && b.TenantId == request.TenantID && b.coa == request.coa);

                        if (duplicateCOA)
                        {
                            return BadRequest(new { error = "COA already exists", coa = "duplicate" });
                        }
                    }
                }

                // Update bank properties
                bank.BankName = request.BankName;
                bank.NickName = request.NickName;
                bank.AccountType = request.AccountType;
                bank.RoutingNumber = request.RoutingNumber;
                bank.Phone = request.Phone;
                bank.Email = request.Email;
                bank.street = request.street;
                bank.apartment = request.apartment ?? string.Empty;
                bank.city = request.city;
                bank.state = request.state;
                bank.zip = request.zip;
                bank.country = request.country ?? "US";
                bank.Balance = request.Balance;
                bank.startingcheck = request.startingcheck;
                bank.checkseries = request.checkseries;
                bank.coa = request.coa ?? string.Empty; // Required in DB, but optional in UI
                bank.status = request.status ?? "Active";
                bank.isprimary = request.isprimary ?? false;
                bank.ispayrollDefault = request.ispayrollDefault ?? false;
                bank.TenantId = request.TenantID;
                bank.locationId = request.locationId;
                
                // Set required fields that may not be in the request (required by database schema)
                bank.accountname = bank.accountname ?? string.Empty;
                bank.displayname = bank.displayname ?? string.Empty;
                bank.Bankcode = bank.Bankcode ?? string.Empty;
                bank.BankStreet1 = bank.BankStreet1 ?? string.Empty;
                bank.BankStreet2 = bank.BankStreet2 ?? string.Empty;

                // Handle Account No encryption/masking
                if (isNew || !string.IsNullOrWhiteSpace(request.AccountNo))
                {
                    bank.AccountNo = request.AccountNo; // In production, encrypt this
                    if (request.AccountNo.Length >= 4)
                    {
                        bank.lastAccountNo = "XXXX" + request.AccountNo.Substring(request.AccountNo.Length - 4);
                    }
                    else
                    {
                        bank.lastAccountNo = "XXXX" + request.AccountNo;
                    }
                }

                if (isNew)
                {
                    _context.BankMaster.Add(bank);
                }
                else
                {
                    _context.BankMaster.Update(bank);
                }

                _context.SaveChanges();

                return Ok(new { result = bank });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("CheckBankDeletionImpact")]
        public IActionResult CheckBankDeletionImpact([FromQuery] int bankId, [FromQuery] int tenantId)
        {
            try
            {
                var bank = _context.BankMaster
                    .FirstOrDefault(b => b.Id == bankId && b.TenantId == tenantId);

                if (bank == null)
                {
                    return NotFound(new { error = "Bank not found" });
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

                // Check Transactions
                var transactions = _context.Transactions
                    .Where(t => t.BankId == bankId && t.TenantId == tenantId)
                    .ToList();
                if (transactions.Any())
                {
                    result.CanDelete = false;
                    result.BlockingDependencies.Add(new BlockingDependency
                    {
                        EntityType = "Transactions",
                        Description = $"This bank is used in {transactions.Count} transaction(s)",
                        Items = transactions.Take(10).Select(t => new DependencyItem
                        {
                            Id = t.TransactionID,
                            Name = $"Transaction #{t.TransactionID}",
                            DeleteEndpoint = $"/api/Transaction/DeleteTransaction?transactionId={t.TransactionID}"
                        }).ToList()
                    });
                }

                // Check VendorInvoiceMaster
                var vendorInvoices = _context.VendorInvoiceMaster
                    .Where(vim => vim.Bankid == bankId && vim.TenantId == tenantId)
                    .ToList();
                if (vendorInvoices.Any())
                {
                    result.CanDelete = false;
                    result.BlockingDependencies.Add(new BlockingDependency
                    {
                        EntityType = "Vendor Invoices",
                        Description = $"This bank is used in {vendorInvoices.Count} vendor invoice(s)",
                        Items = vendorInvoices.Take(10).Select(vi => new DependencyItem
                        {
                            Id = vi.Id,
                            Name = !string.IsNullOrEmpty(vi.InvoiceNo) ? $"Invoice #{vi.InvoiceNo}" : $"Invoice #{vi.Id}",
                            DeleteEndpoint = $"/api/VendorInvoice/DeleteVendorInvoice?vendorInvoiceId={vi.Id}"
                        }).ToList()
                    });
                }

                // Check InvoiceMaster
                var customerInvoices = _context.InvoiceMaster
                    .Where(im => im.Bankid == bankId && im.TenantId == tenantId)
                    .ToList();
                if (customerInvoices.Any())
                {
                    result.CanDelete = false;
                    result.BlockingDependencies.Add(new BlockingDependency
                    {
                        EntityType = "Customer Invoices",
                        Description = $"This bank is used in {customerInvoices.Count} customer invoice(s)",
                        Items = customerInvoices.Take(10).Select(ci => new DependencyItem
                        {
                            Id = ci.Id,
                            Name = ci.InvoiceNo > 0 ? $"Invoice #{ci.InvoiceNo}" : $"Invoice #{ci.Id}",
                            DeleteEndpoint = $"/api/Invoice/DeleteInvoice?invoiceId={ci.Id}"
                        }).ToList()
                    });
                }

                // Check BankCOAMapping
                var bankMappings = _context.BankCOAMapping
                    .Where(b => b.bankid == bankId)
                    .ToList();
                if (bankMappings.Any())
                {
                    result.WillBeDeleted.Add(new ImpactedEntity
                    {
                        EntityType = "Bank COA Mappings",
                        Count = bankMappings.Count,
                        Description = "Bank COA mappings will be deleted"
                    });
                }

                if (!result.CanDelete)
                {
                    result.BlockingReasons.Add("This Bank is referenced by transactions, invoices, or other entities.");
                }

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpDelete("DeleteBank")]
        public IActionResult DeleteBank([FromQuery] int bankId, [FromQuery] int tenantId)
        {
            try
            {
                var bank = _context.BankMaster
                    .FirstOrDefault(b => b.Id == bankId && b.TenantId == tenantId);

                if (bank == null)
                {
                    return NotFound(new { error = "Bank not found" });
                }

                // Delete child records first
                var bankMappings = _context.BankCOAMapping
                    .Where(b => b.bankid == bankId)
                    .ToList();
                _context.BankCOAMapping.RemoveRange(bankMappings);

                // Delete the bank
                _context.BankMaster.Remove(bank);
                _context.SaveChanges();

                return Ok(new { result = new { message = "Bank deleted successfully" } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }
    }

    // Request DTO
    public class BankMasterReq
    {
        public int Id { get; set; }
        public string BankName { get; set; }
        public string AccountNo { get; set; }
        public string AccountType { get; set; }
        public string RoutingNumber { get; set; }
        public string Phone { get; set; }
        public string Email { get; set; }
        public string street { get; set; }
        public string apartment { get; set; }
        public string city { get; set; }
        public string state { get; set; }
        public string zip { get; set; }
        public string country { get; set; }
        public decimal Balance { get; set; }
        public int? startingcheck { get; set; }
        public string checkseries { get; set; }
        public string coa { get; set; }
        public string NickName { get; set; }
        public string status { get; set; }
        public bool? isprimary { get; set; }
        public bool? ispayrollDefault { get; set; }
        public int TenantID { get; set; }
        public int locationId { get; set; }
    }
}

