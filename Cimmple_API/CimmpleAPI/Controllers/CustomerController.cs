using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Dtos;
using CimmpleAPI.Services;
using Microsoft.EntityFrameworkCore.Storage;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CustomerController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;
        private readonly ILogger<CustomerController> _logger;
        private static bool _sequenceTableEnsured;

        public CustomerController(CimmpleDbContext context, ILogger<CustomerController> logger)
        {
            _context = context;
            _logger = logger;
        }

        private IActionResult ServerError(Exception ex, string action)
        {
            _logger.LogError(ex, "Customer {Action} failed", action);
            return StatusCode(500, new { error = "An unexpected error occurred. Please try again." });
        }

        // Same rules as Common/Utils/validation.ts so the API, import and slideout agree.
        private static readonly Regex EmailPattern = new(@"^[^\s@]+@[^\s@]+\.[^\s@]+$");
        private static readonly Regex ZipPattern = new(@"^[0-9]{5}(-[0-9]{4})?$|^[A-Z0-9]{3,10}$", RegexOptions.IgnoreCase);

        private static bool IsValidEmail(string? v) => string.IsNullOrWhiteSpace(v) || EmailPattern.IsMatch(v.Trim());
        private static bool IsValidZip(string? v) => string.IsNullOrWhiteSpace(v) || ZipPattern.IsMatch(v.Trim());
        private static bool IsValidPhone(string? v)
        {
            if (string.IsNullOrWhiteSpace(v)) return true;
            var digits = v.Count(char.IsDigit);
            return digits >= 10 && digits <= 15;
        }

        private static string? FormatError(string label, string? email, string? phone, string? zip, string? shippingZip = null)
        {
            if (!IsValidEmail(email)) return $"{label}: please enter a valid email address";
            if (!IsValidPhone(phone)) return $"{label}: please enter a valid phone number (10-15 digits)";
            if (!IsValidZip(zip)) return $"{label}: please enter a valid zip/postal code";
            if (!IsValidZip(shippingZip)) return $"{label}: please enter a valid shipping zip/postal code";
            return null;
        }

        // Serialises customer creates and imports per tenant so the name check and code allocation can't race.
        private void LockCustomerMaster(int tenantId)
        {
            _context.Database.ExecuteSqlRaw(@"
DECLARE @r int;
EXEC @r = sp_getapplock @Resource = {0}, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000;
IF @r < 0 THROW 51000, 'Customer master is busy, please try again.', 1;", $"customer-master-{tenantId}");
        }

        private void EnsureSequenceTable()
        {
            if (_sequenceTableEnsured) return;
            _context.Database.ExecuteSqlRaw(@"
IF OBJECT_ID('CimmpleFlow.MasterCodeSequence') IS NULL
CREATE TABLE CimmpleFlow.MasterCodeSequence (
    TenantId int NOT NULL,
    Prefix nvarchar(10) NOT NULL,
    LastValue int NOT NULL,
    CONSTRAINT PK_MasterCodeSequence PRIMARY KEY (TenantId, Prefix));");
            _sequenceTableEnsured = true;
        }

        /// <summary>
        /// Next customer code that is above both the highest existing code and every code ever issued,
        /// so codes of deleted customers are not reissued. Must run inside the customer-master lock.
        /// </summary>
        private string NextCustomerCode(int tenantId, IEnumerable<string?> takenCodes)
        {
            var taken = new HashSet<string>(takenCodes.Where(c => !string.IsNullOrWhiteSpace(c)).Select(c => c!.Trim()), StringComparer.OrdinalIgnoreCase);
            var conn = _context.Database.GetDbConnection();
            using var cmd = conn.CreateCommand();
            cmd.Transaction = _context.Database.CurrentTransaction?.GetDbTransaction();
            cmd.CommandText = "SELECT LastValue FROM CimmpleFlow.MasterCodeSequence WHERE TenantId = @t AND Prefix = 'C'";
            var p = cmd.CreateParameter(); p.ParameterName = "@t"; p.Value = tenantId; cmd.Parameters.Add(p);
            var last = cmd.ExecuteScalar() is int v ? v : 0;

            var seq = Math.Max(MasterCodeGenerator.GetNextSequence(taken, 'C'), last + 1);
            while (taken.Contains($"C{seq}")) seq++;

            RecordIssuedCode(tenantId, $"C{seq}");
            return $"C{seq}";
        }

        private void RecordIssuedCode(int tenantId, string? code)
        {
            var c = code?.Trim() ?? "";
            if (c.Length < 2 || char.ToUpperInvariant(c[0]) != 'C' || !int.TryParse(c.Substring(1), out var n) || n <= 0) return;
            _context.Database.ExecuteSqlRaw(@"
UPDATE CimmpleFlow.MasterCodeSequence SET LastValue = CASE WHEN LastValue < {1} THEN {1} ELSE LastValue END WHERE TenantId = {0} AND Prefix = 'C';
IF @@ROWCOUNT = 0 INSERT INTO CimmpleFlow.MasterCodeSequence (TenantId, Prefix, LastValue) VALUES ({0}, 'C', {1});", tenantId, n);
        }

        /// <summary>
        /// Documents that stop a customer from being deleted, leaf-first so that deleting them in the
        /// listed order satisfies each downstream delete rule (shipments and invoices before orders,
        /// job orders before orders, orders before quotations).
        /// </summary>
        private List<BlockingDependency> GetDeleteBlockers(int customerId, int tenantId)
        {
            var blockers = new List<BlockingDependency>();
            var orders = _context.CustomerOrder.AsNoTracking()
                .Where(co => co.CustomerID == customerId && co.Tenantid == tenantId)
                .Select(co => new { co.OrderID, co.PONumber })
                .ToList();
            var orderIds = orders.Select(o => o.OrderID).ToList();

            var shipments = _context.Shipping.AsNoTracking()
                .Where(s => s.TenantId == tenantId && orderIds.Contains(s.OrderId))
                .Select(s => new { s.Id, s.ShipmentNo })
                .ToList();
            if (shipments.Any())
            {
                blockers.Add(new BlockingDependency
                {
                    EntityType = "Shipment",
                    Description = $"Customer has {shipments.Count} shipment(s) associated",
                    Items = shipments.Select(s => new DependencyItem { Id = s.Id, Name = s.ShipmentNo ?? $"Shipment #{s.Id}", DeleteEndpoint = $"/Shipping/DeleteShipment?shipmentId={s.Id}&tenantId={tenantId}" }).ToList()
                });
            }

            // Voided invoices are already reversed and don't block order deletion, so they are not listed.
            var invoices = _context.InvoiceMaster.AsNoTracking()
                .Where(im => im.TenantId == tenantId && !im.IsVoided
                    && _context.InvoiceDetail.Any(d => d.InvoiceId == im.Id && orderIds.Contains(d.OrderId)))
                .Select(im => new { im.Id, im.InvoiceNo, im.PaidAmount, im.PaymentDate })
                .ToList();
            if (invoices.Any())
            {
                blockers.Add(new BlockingDependency
                {
                    EntityType = "Invoice",
                    Description = $"Customer has {invoices.Count} invoice(s) associated",
                    Items = invoices.Select(im =>
                    {
                        var label = im.InvoiceNo > 0 ? $"Invoice #{im.InvoiceNo}" : $"Invoice #{im.Id}";
                        var paid = im.PaidAmount > 0.009m || im.PaymentDate.HasValue;
                        return new DependencyItem
                        {
                            Id = im.Id,
                            Name = paid ? $"{label} (paid - reverse the payment first)" : label,
                            DeleteEndpoint = paid ? "" : $"/Invoice/DeleteInvoice?invoiceId={im.Id}&tenantId={tenantId}"
                        };
                    }).ToList()
                });
            }

            var jobOrders = _context.JobOrderMaster.AsNoTracking()
                .Where(j => j.Tenantid == tenantId && (orderIds.Contains(j.CustomerOrderID) || j.CustomerID == customerId))
                .Select(j => new { j.JobOrderID, j.JobNumber, j.JobOrderNumber })
                .ToList();
            if (jobOrders.Any())
            {
                blockers.Add(new BlockingDependency
                {
                    EntityType = "JobOrder",
                    Description = $"Customer has {jobOrders.Count} job order(s) associated",
                    Items = jobOrders.Select(j => new DependencyItem { Id = j.JobOrderID, Name = string.IsNullOrWhiteSpace(j.JobNumber) ? $"JO#{j.JobOrderNumber}" : j.JobNumber, DeleteEndpoint = $"/JobOrder/DeleteJobOrder?jobOrderId={j.JobOrderID}&tenantId={tenantId}" }).ToList()
                });
            }

            if (orders.Any())
            {
                blockers.Add(new BlockingDependency
                {
                    EntityType = "CustomerOrder",
                    Description = $"Customer has {orders.Count} order(s) associated",
                    Items = orders.Select(co => new DependencyItem { Id = co.OrderID, Name = $"CO#{co.PONumber}", DeleteEndpoint = $"/Order/DeleteOrder?orderId={co.OrderID}&tenantId={tenantId}" }).ToList()
                });
            }

            var quotations = _context.QuotationOrder.AsNoTracking()
                .Where(q => q.CustomerID == customerId && q.Tenantid == tenantId)
                .Select(q => new { q.OrderID, q.PONumber })
                .ToList();
            if (quotations.Any())
            {
                blockers.Add(new BlockingDependency
                {
                    EntityType = "Quotation",
                    Description = $"Customer has {quotations.Count} quotation(s) associated",
                    Items = quotations.Select(q => new DependencyItem { Id = q.OrderID, Name = $"Q#{q.PONumber}", DeleteEndpoint = $"/Quotation/DeleteQuotation?quotationId={q.OrderID}&tenantId={tenantId}" }).ToList()
                });
            }

            return blockers;
        }

        [HttpGet("GetCustomerlist")]
        public IActionResult GetCustomerlist([FromQuery] int tenantid)
        {
            try
            {
                var customers = _context.CustomerMaster
                    .Where(c => c.Tenantid == tenantid)
                    .Select(c => new
                    {
                        c.customer_id,
                        c.customercode,
                        c.company_name,
                        c.companyAlias,
                        c.email,
                        c.address,
                        c.apartment,
                        c.city,
                        c.state,
                        c.zip,
                        c.country,
                        c.shippingAddress,
                        c.shippingCity,
                        c.shippingStates,
                        c.shippingCountry,
                        c.shippingZipCode,
                        c.shippingApartment,
                        c.status,
                        contactPerson = _context.CustomerContact
                            .Where(cc => cc.customer_id == c.customer_id && cc.isDefault == true)
                            .Select(cc => string.IsNullOrWhiteSpace(cc.lastname) 
                                ? cc.firstname 
                                : $"{cc.firstname} {cc.lastname}".Trim())
                            .FirstOrDefault() ?? "",
                        // Prefer default contact phone; if it's null/empty, fall back to company phone_number
                        phone_number = _context.CustomerContact
                            .Where(cc => cc.customer_id == c.customer_id && cc.isDefault == true)
                            .Select(cc => string.IsNullOrEmpty(cc.phoneno) ? c.phone_number : cc.phoneno)
                            .FirstOrDefault() ?? c.phone_number
                    })
                    .ToList()
                    .Select(c => new
                    {
                        c.customer_id,
                        c.customercode,
                        c.company_name,
                        c.companyAlias,
                        c.email,
                        c.address,
                        c.apartment,
                        c.city,
                        c.state,
                        c.zip,
                        c.country,
                        c.shippingAddress,
                        c.shippingCity,
                        c.shippingStates,
                        c.shippingCountry,
                        c.shippingZipCode,
                        c.shippingApartment,
                        c.status,
                        fullAddress = BuildFullAddress(c.address, c.city, c.state, c.zip),
                        c.contactPerson,
                        c.phone_number
                    })
                    .ToList();

                return Ok(new { result = customers });
            }
            catch (Exception ex)
            {
                return ServerError(ex, "list");
            }
        }

        [HttpGet("GetCustomerById")]
        public IActionResult GetCustomerById([FromQuery] int customerId, [FromQuery] int tenantId)
        {
            try
            {
                var customer = _context.CustomerMaster
                    .Where(c => c.customer_id == customerId && c.Tenantid == tenantId)
                    .FirstOrDefault();

                if (customer == null)
                {
                    return NotFound(new { error = "Customer not found" });
                }

                var contacts = _context.CustomerContact
                    .Where(cc => cc.customer_id == customerId)
                    .ToList();

                var billingAddresses = _context.CustomerBillingAddress
                    .Where(cb => cb.customer_id == customerId)
                    .ToList();

                var shippingAddresses = _context.CustomerShippingAddressNew
                    .Where(cs => cs.customer_id == customerId)
                    .ToList();

                var result = new
                {
                    customer_id = customer.customer_id,
                    customercode = customer.customercode,
                    company_name = customer.company_name,
                    companyAlias = customer.companyAlias,
                    email = customer.email,
                    phone_number = customer.phone_number,
                    address = customer.address,
                    apartment = customer.apartment,
                    city = customer.city,
                    state = customer.state,
                    zip = customer.zip,
                    country = customer.country ?? "US",
                    shippingAddress = customer.shippingAddress,
                    shippingCity = customer.shippingCity,
                    shippingStates = customer.shippingStates,
                    shippingCountry = customer.shippingCountry ?? "US",
                    shippingZipCode = customer.shippingZipCode,
                    shippingApartment = customer.shippingApartment,
                    status = customer.status ?? "Active",
                    Tenantid = customer.Tenantid,
                    CustomerContact = contacts,
                    CustomerBillingAddress = billingAddresses,
                    ShippingAddresses = shippingAddresses
                };

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                return ServerError(ex, "get");
            }
        }

        [HttpPost("SaveCustomerData")]
        public IActionResult SaveCustomerData([FromBody] CustomerMasterReq request)
        {
            try
            {
                if (request == null)
                {
                    return BadRequest(new { error = "Request body is required" });
                }

                if (request.TenantID == 0)
                {
                    return BadRequest(new { error = "TenantID is required" });
                }

                if (string.IsNullOrWhiteSpace(request.company_name))
                {
                    return BadRequest(new { error = "Company name is required" });
                }

                var formatError = FormatError("Company", request.email, request.phone_number, request.zip, request.shippingZipCode);
                if (formatError == null && request.CustomerContact != null)
                {
                    foreach (var c in request.CustomerContact)
                    {
                        var label = string.IsNullOrWhiteSpace(c.firstname) ? "Contact" : $"Contact '{c.firstname.Trim()}'";
                        formatError = FormatError(label, c.email, c.phoneno, null);
                        if (formatError != null) break;
                    }
                }
                if (formatError != null)
                {
                    return BadRequest(new { error = formatError });
                }

                var normalizedStatus = ParseCustomerStatus(request.status);
                if (!string.IsNullOrWhiteSpace(request.status) && normalizedStatus == null)
                {
                    return BadRequest(new { error = "Status must be Active or Inactive" });
                }

                EnsureSequenceTable();
                using var tx = _context.Database.BeginTransaction();
                LockCustomerMaster(request.TenantID);

                var companyNameNorm = request.company_name.Trim();
                var nameDuplicate = _context.CustomerMaster
                    .Any(c => c.Tenantid == request.TenantID
                              && c.customer_id != request.customer_id
                              && c.company_name != null
                              && c.company_name.Trim().ToLower() == companyNameNorm.ToLower());
                if (nameDuplicate)
                {
                    return BadRequest(new { error = $"Customer name '{companyNameNorm}' already exists" });
                }

                var existingCustomer = _context.CustomerMaster
                    .FirstOrDefault(c => c.customer_id == request.customer_id && c.Tenantid == request.TenantID);

                CustomerMaster customer;
                bool isNew = existingCustomer == null;

                if (isNew)
                {
                    customer = new CustomerMaster();
                    var existingCodes = _context.CustomerMaster
                        .Where(c => c.Tenantid == request.TenantID)
                        .Select(c => c.customercode)
                        .ToList();
                    customer.customercode = NextCustomerCode(request.TenantID, existingCodes);
                }
                else
                {
                    customer = existingCustomer;
                }

                // Update customer properties
                customer.company_name = companyNameNorm;
                customer.companyAlias = request.companyAlias ?? "";
                customer.email = request.email ?? "";
                customer.phone_number = request.phone_number ?? "";
                customer.address = request.address ?? "";
                customer.apartment = request.apartment ?? "";
                customer.city = request.City ?? "";
                customer.state = request.states ?? "";
                customer.zip = request.zip ?? "";
                customer.country = request.country ?? "US";
                customer.shippingAddress = request.shippingAddress ?? "";
                customer.shippingCity = request.shippingCity ?? "";
                customer.shippingStates = request.shippingStates ?? "";
                customer.shippingCountry = request.shippingCountry ?? "US";
                customer.shippingZipCode = request.shippingZipCode ?? "";
                customer.shippingApartment = request.shippingApartment ?? "";
                customer.status = normalizedStatus ?? "Active";
                customer.Tenantid = request.TenantID;
                
                // Set required fields that may not be in the request
                customer.ContactEmail = request.email ?? ""; // Use email as ContactEmail if not provided
                customer.Pointofcontact = ""; // Set to empty string if not provided
                customer.WebAddress = ""; // Set to empty string if not provided
                customer.last_name = ""; // Set to empty string if not provided

                // Set firstname from default contact
                if (request.CustomerContact != null && request.CustomerContact.Any())
                {
                    var defaultContact = request.CustomerContact.FirstOrDefault(c => c.isDefault);
                    customer.firstname = defaultContact?.firstname ?? "";
                }
                else
                {
                    customer.firstname = "";
                }

                if (isNew)
                {
                    _context.CustomerMaster.Add(customer);
                }
                else
                {
                    _context.CustomerMaster.Update(customer);
                }

                _context.SaveChanges();

                // Handle Customer Contacts
                if (request.CustomerContact != null && request.CustomerContact.Any())
                {
                    // Delete existing contacts for this customer
                    var existingContacts = _context.CustomerContact
                        .Where(cc => cc.customer_id == customer.customer_id)
                        .ToList();
                    _context.CustomerContact.RemoveRange(existingContacts);

                    // Add new contacts
                    foreach (var contactReq in request.CustomerContact)
                    {
                        var contact = new CustomerContact
                        {
                            customer_id = customer.customer_id,
                            title = contactReq.title,
                            firstname = contactReq.firstname,
                            lastname = contactReq.lastname,
                            phoneno = contactReq.phoneno,
                            email = contactReq.email,
                            isDefault = contactReq.isDefault
                        };
                        _context.CustomerContact.Add(contact);
                    }
                    _context.SaveChanges();
                }

                // Handle Billing Address
                var existingBilling = _context.CustomerBillingAddress
                    .FirstOrDefault(cb => cb.customer_id == customer.customer_id);

                if (existingBilling != null)
                {
                    existingBilling.billing_address_line1 = request.address;
                    existingBilling.billing_address_line2 = request.apartment;
                    existingBilling.billing_city = request.City;
                    existingBilling.billing_state = request.states;
                    existingBilling.billing_postal_code = request.zip;
                    existingBilling.billing_country = request.country ?? "US";
                    existingBilling.IsDefault = 1;
                    existingBilling.TenantId = request.TenantID;
                    _context.CustomerBillingAddress.Update(existingBilling);
                }
                else
                {
                    var billingAddress = new CustomerBillingAddress
                    {
                        customer_id = customer.customer_id,
                        billing_address_line1 = request.address,
                        billing_address_line2 = request.apartment,
                        billing_city = request.City,
                        billing_state = request.states,
                        billing_postal_code = request.zip,
                        billing_country = request.country ?? "US",
                        IsDefault = 1,
                        TenantId = request.TenantID
                    };
                    _context.CustomerBillingAddress.Add(billingAddress);
                }
                _context.SaveChanges();
                tx.Commit();

                // Reload contacts to include in response
                var contacts = _context.CustomerContact
                    .Where(cc => cc.customer_id == customer.customer_id)
                    .Select(cc => new
                    {
                        id = cc.id,
                        customer_id = cc.customer_id,
                        title = cc.title ?? "",
                        firstname = cc.firstname ?? "",
                        lastname = cc.lastname ?? "",
                        phoneno = cc.phoneno ?? "",
                        email = cc.email ?? "",
                        isDefault = cc.isDefault
                    })
                    .ToList();

                var result = new
                {
                    customer_id = customer.customer_id,
                    customercode = customer.customercode,
                    company_name = customer.company_name,
                    companyAlias = customer.companyAlias,
                    email = customer.email,
                    phone_number = customer.phone_number,
                    address = customer.address,
                    apartment = customer.apartment,
                    city = customer.city,
                    state = customer.state,
                    zip = customer.zip,
                    country = customer.country ?? "US",
                    shippingAddress = customer.shippingAddress,
                    shippingCity = customer.shippingCity,
                    shippingStates = customer.shippingStates,
                    shippingCountry = customer.shippingCountry ?? "US",
                    shippingZipCode = customer.shippingZipCode,
                    shippingApartment = customer.shippingApartment,
                    status = customer.status ?? "Active",
                    Tenantid = customer.Tenantid,
                    CustomerContact = contacts
                };

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                return ServerError(ex, "save");
            }
        }

        [HttpPost("ImportCustomers")]
        public IActionResult ImportCustomers([FromBody] CustomerImportRequest request)
        {
            try
            {
                if (request == null || request.Rows == null || request.Rows.Count == 0)
                {
                    return BadRequest(new { error = "No rows to import" });
                }

                if (request.Tenantid <= 0)
                {
                    return BadRequest(new { error = "Tenantid is required" });
                }

                EnsureSequenceTable();
                using var tx = _context.Database.BeginTransaction();
                LockCustomerMaster(request.Tenantid);

                var existing = _context.CustomerMaster
                    .Where(c => c.Tenantid == request.Tenantid)
                    .ToList();

                var existingIds = existing.Select(c => c.customer_id).ToList();
                var existingContacts = existingIds.Count == 0
                    ? new List<CustomerContact>()
                    : _context.CustomerContact
                        .Where(cc => existingIds.Contains(cc.customer_id))
                        .ToList();

                var existingBilling = existingIds.Count == 0
                    ? new List<CustomerBillingAddress>()
                    : _context.CustomerBillingAddress
                        .Where(cb => existingIds.Contains(cb.customer_id))
                        .ToList();

                var fileCodes = request.Rows.Select(r => r.CustomerCode?.Trim()).Where(c => !string.IsNullOrEmpty(c)).ToList();
                var result = new CustomerImportResult();
                var rowResults = new List<CustomerImportRowResult>();
                var batchNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var batchCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                try
                {
                    for (int i = 0; i < request.Rows.Count; i++)
                    {
                        var row = request.Rows[i];
                        var rowNumber = row.RowNumber ?? (i + 2);
                        var rowResult = new CustomerImportRowResult { RowNumber = rowNumber };

                        var companyName = (row.CompanyName ?? "").Trim();
                        var customerCode = (row.CustomerCode ?? "").Trim();

                        if (string.IsNullOrWhiteSpace(companyName))
                        {
                            rowResult.Status = "Error";
                            rowResult.Message = "Company Name is required";
                            result.Failed++;
                            rowResults.Add(rowResult);
                            continue;
                        }

                        var rowFormatError =
                            FormatError("Company", row.Email, row.Phone, row.Zip, row.ShippingZip) ??
                            FormatError("Contact", row.ContactEmail, row.ContactPhone, null);
                        if (rowFormatError == null && !string.IsNullOrWhiteSpace(row.Status) && ParseCustomerStatus(row.Status) == null)
                        {
                            rowFormatError = $"Status '{row.Status.Trim()}' is not valid (use Active or Inactive)";
                        }
                        if (rowFormatError != null)
                        {
                            rowResult.Status = "Error";
                            rowResult.Message = rowFormatError;
                            result.Failed++;
                            rowResults.Add(rowResult);
                            continue;
                        }

                        if (!string.IsNullOrEmpty(customerCode) && !batchCodes.Add(customerCode))
                        {
                            rowResult.Status = "Error";
                            rowResult.Message = $"Duplicate Customer Code '{customerCode}' in import file";
                            result.Failed++;
                            rowResults.Add(rowResult);
                            continue;
                        }

                        if (!batchNames.Add(companyName))
                        {
                            rowResult.Status = "Error";
                            rowResult.Message = $"Duplicate Company Name '{companyName}' in import file";
                            result.Failed++;
                            rowResults.Add(rowResult);
                            continue;
                        }

                        CustomerMaster? match = null;
                        if (!string.IsNullOrEmpty(customerCode))
                        {
                            match = existing.FirstOrDefault(c =>
                                string.Equals(c.customercode, customerCode, StringComparison.OrdinalIgnoreCase));
                        }
                        if (match == null)
                        {
                            match = existing.FirstOrDefault(c =>
                                string.Equals(c.company_name, companyName, StringComparison.OrdinalIgnoreCase));
                        }

                        var nameConflict = existing.FirstOrDefault(c =>
                            (match == null || c.customer_id != match.customer_id) &&
                            string.Equals(c.company_name, companyName, StringComparison.OrdinalIgnoreCase));
                        if (nameConflict != null)
                        {
                            rowResult.Status = "Error";
                            rowResult.Message = $"Company Name '{companyName}' already exists";
                            result.Failed++;
                            rowResults.Add(rowResult);
                            continue;
                        }

                        if (!string.IsNullOrEmpty(customerCode))
                        {
                            var codeConflict = existing.FirstOrDefault(c =>
                                (match == null || c.customer_id != match.customer_id) &&
                                !string.IsNullOrEmpty(c.customercode) &&
                                string.Equals(c.customercode, customerCode, StringComparison.OrdinalIgnoreCase));
                            if (codeConflict != null)
                            {
                                rowResult.Status = "Error";
                                rowResult.Message = $"Customer Code '{customerCode}' already exists";
                                result.Failed++;
                                rowResults.Add(rowResult);
                                continue;
                            }
                        }

                        var status = ParseCustomerStatus(row.Status);
                        var country = string.IsNullOrWhiteSpace(row.Country) ? null : row.Country.Trim();
                        var shippingCountry = string.IsNullOrWhiteSpace(row.ShippingCountry) ? null : row.ShippingCountry.Trim();

                        CustomerMaster customer;
                        bool isNew = match == null;

                        if (match != null)
                        {
                            if (!request.UpdateExisting)
                            {
                                rowResult.Status = "Skipped";
                                rowResult.Message = "Customer already exists";
                                rowResult.CustomerId = match.customer_id;
                                result.Skipped++;
                                rowResults.Add(rowResult);
                                continue;
                            }

                            customer = match;
                            if (!string.IsNullOrEmpty(customerCode))
                            {
                                customer.customercode = customerCode;
                                RecordIssuedCode(request.Tenantid, customerCode);
                            }
                            customer.company_name = companyName;
                            if (row.CompanyAlias != null) customer.companyAlias = row.CompanyAlias.Trim();
                            if (row.Email != null) customer.email = row.Email.Trim();
                            if (row.Phone != null) customer.phone_number = row.Phone.Trim();
                            if (row.Address != null) customer.address = row.Address.Trim();
                            if (row.Apartment != null) customer.apartment = row.Apartment.Trim();
                            if (row.City != null) customer.city = row.City.Trim();
                            if (row.State != null) customer.state = row.State.Trim();
                            if (row.Zip != null) customer.zip = row.Zip.Trim();
                            if (country != null) customer.country = country;
                            if (row.ShippingAddress != null) customer.shippingAddress = row.ShippingAddress.Trim();
                            if (row.ShippingApartment != null) customer.shippingApartment = row.ShippingApartment.Trim();
                            if (row.ShippingCity != null) customer.shippingCity = row.ShippingCity.Trim();
                            if (row.ShippingState != null) customer.shippingStates = row.ShippingState.Trim();
                            if (row.ShippingZip != null) customer.shippingZipCode = row.ShippingZip.Trim();
                            if (shippingCountry != null) customer.shippingCountry = shippingCountry;
                            if (status != null) customer.status = status;
                            customer.ContactEmail = customer.email ?? "";

                            rowResult.Status = "Updated";
                            rowResult.Message = "Updated";
                            rowResult.CustomerId = customer.customer_id;
                            result.Updated++;
                        }
                        else
                        {
                            if (string.IsNullOrEmpty(customerCode))
                            {
                                customerCode = NextCustomerCode(request.Tenantid, existing.Select(c => c.customercode).Concat(fileCodes));
                            }
                            else
                            {
                                RecordIssuedCode(request.Tenantid, customerCode);
                            }
                            customer = new CustomerMaster
                            {
                                Tenantid = request.Tenantid,
                                customercode = customerCode,
                                company_name = companyName,
                                companyAlias = row.CompanyAlias?.Trim() ?? "",
                                email = row.Email?.Trim() ?? "",
                                phone_number = row.Phone?.Trim() ?? "",
                                address = row.Address?.Trim() ?? "",
                                apartment = row.Apartment?.Trim() ?? "",
                                city = row.City?.Trim() ?? "",
                                state = row.State?.Trim() ?? "",
                                zip = row.Zip?.Trim() ?? "",
                                country = country ?? "US",
                                shippingAddress = row.ShippingAddress?.Trim() ?? "",
                                shippingApartment = row.ShippingApartment?.Trim() ?? "",
                                shippingCity = row.ShippingCity?.Trim() ?? "",
                                shippingStates = row.ShippingState?.Trim() ?? "",
                                shippingZipCode = row.ShippingZip?.Trim() ?? "",
                                shippingCountry = shippingCountry ?? "US",
                                status = status ?? "Active",
                                ContactEmail = row.Email?.Trim() ?? "",
                                Pointofcontact = "",
                                WebAddress = "",
                                firstname = row.ContactFirstName?.Trim() ?? "",
                                last_name = row.ContactLastName?.Trim() ?? ""
                            };
                            _context.CustomerMaster.Add(customer);
                            existing.Add(customer);
                            _context.SaveChanges();

                            rowResult.Status = "Created";
                            rowResult.Message = "Created";
                            rowResult.CustomerId = customer.customer_id;
                            result.Created++;
                        }

                        UpsertImportedContact(customer, row, existingContacts, isNew);
                        UpsertImportedBilling(customer, row, existingBilling, request.Tenantid, isNew);

                        rowResults.Add(rowResult);
                    }

                    if (request.StopOnError && result.Failed > 0)
                    {
                        tx.Rollback();
                        return BadRequest(new
                        {
                            error = "Import cancelled due to validation errors",
                            result = new
                            {
                                created = 0,
                                updated = 0,
                                skipped = 0,
                                failed = result.Failed,
                                rows = rowResults
                            }
                        });
                    }

                    _context.SaveChanges();
                    tx.Commit();

                    result.Rows = rowResults;
                    return Ok(new { result });
                }
                catch
                {
                    tx.Rollback();
                    throw;
                }
            }
            catch (Exception ex)
            {
                return ServerError(ex, "import");
            }
        }

        private void UpsertImportedContact(
            CustomerMaster customer,
            CustomerImportRow row,
            List<CustomerContact> existingContacts,
            bool isNew)
        {
            var hasContactData =
                !string.IsNullOrWhiteSpace(row.ContactFirstName) ||
                !string.IsNullOrWhiteSpace(row.ContactLastName) ||
                !string.IsNullOrWhiteSpace(row.ContactPhone) ||
                !string.IsNullOrWhiteSpace(row.ContactEmail) ||
                !string.IsNullOrWhiteSpace(row.ContactTitle);

            if (!hasContactData && !isNew) return;

            var contact = existingContacts.FirstOrDefault(c =>
                c.customer_id == customer.customer_id && c.isDefault);

            if (contact == null && !isNew)
            {
                contact = existingContacts.FirstOrDefault(c => c.customer_id == customer.customer_id);
            }

            if (contact == null)
            {
                if (!hasContactData) return;

                contact = new CustomerContact
                {
                    customer_id = customer.customer_id,
                    title = row.ContactTitle?.Trim() ?? "",
                    firstname = row.ContactFirstName?.Trim() ?? "",
                    lastname = row.ContactLastName?.Trim() ?? "",
                    phoneno = row.ContactPhone?.Trim() ?? row.Phone?.Trim() ?? "",
                    email = row.ContactEmail?.Trim() ?? row.Email?.Trim() ?? "",
                    isDefault = true
                };
                _context.CustomerContact.Add(contact);
                existingContacts.Add(contact);
            }
            else if (hasContactData)
            {
                if (row.ContactTitle != null) contact.title = row.ContactTitle.Trim();
                if (row.ContactFirstName != null) contact.firstname = row.ContactFirstName.Trim();
                if (row.ContactLastName != null) contact.lastname = row.ContactLastName.Trim();
                if (row.ContactPhone != null) contact.phoneno = row.ContactPhone.Trim();
                if (row.ContactEmail != null) contact.email = row.ContactEmail.Trim();
                contact.isDefault = true;
            }

            if (!string.IsNullOrWhiteSpace(contact.firstname))
            {
                customer.firstname = contact.firstname;
            }
            if (!string.IsNullOrWhiteSpace(contact.lastname))
            {
                customer.last_name = contact.lastname;
            }
        }

        private void UpsertImportedBilling(
            CustomerMaster customer,
            CustomerImportRow row,
            List<CustomerBillingAddress> existingBilling,
            int tenantId,
            bool isNew)
        {
            var hasBilling =
                !string.IsNullOrWhiteSpace(row.Address) ||
                !string.IsNullOrWhiteSpace(row.City) ||
                !string.IsNullOrWhiteSpace(row.State) ||
                !string.IsNullOrWhiteSpace(row.Zip) ||
                !string.IsNullOrWhiteSpace(row.Country) ||
                !string.IsNullOrWhiteSpace(row.Apartment);

            if (!hasBilling && !isNew) return;

            var billing = existingBilling.FirstOrDefault(b => b.customer_id == customer.customer_id);
            if (billing == null)
            {
                billing = new CustomerBillingAddress
                {
                    customer_id = customer.customer_id,
                    billing_address_line1 = customer.address ?? "",
                    billing_address_line2 = customer.apartment ?? "",
                    billing_city = customer.city ?? "",
                    billing_state = customer.state ?? "",
                    billing_postal_code = customer.zip ?? "",
                    billing_country = customer.country ?? "US",
                    IsDefault = 1,
                    TenantId = tenantId
                };
                _context.CustomerBillingAddress.Add(billing);
                existingBilling.Add(billing);
            }
            else if (hasBilling)
            {
                if (row.Address != null) billing.billing_address_line1 = row.Address.Trim();
                if (row.Apartment != null) billing.billing_address_line2 = row.Apartment.Trim();
                if (row.City != null) billing.billing_city = row.City.Trim();
                if (row.State != null) billing.billing_state = row.State.Trim();
                if (row.Zip != null) billing.billing_postal_code = row.Zip.Trim();
                if (row.Country != null) billing.billing_country = row.Country.Trim();
                billing.IsDefault = 1;
                billing.TenantId = tenantId;
            }
        }

        private static string? ParseCustomerStatus(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var v = value.Trim().ToLowerInvariant();
            if (v is "active" or "1" or "yes" or "true") return "Active";
            if (v is "inactive" or "0" or "no" or "false") return "Inactive";
            return null;
        }

        [HttpGet("CheckCustomerDeletionImpact")]
        public IActionResult CheckCustomerDeletionImpact([FromQuery] int customerId, [FromQuery] int tenantId)
        {
            try
            {
                var customer = _context.CustomerMaster
                    .FirstOrDefault(c => c.customer_id == customerId && c.Tenantid == tenantId);

                if (customer == null)
                {
                    return NotFound(new { error = "Customer not found" });
                }

                var impact = new DeletionImpactResult
                {
                    CanDelete = true,
                    BlockingReasons = new List<string>(),
                    BlockingDependencies = new List<BlockingDependency>(),
                    WillBeDeleted = new List<ImpactedEntity>(),
                    WillBeAffected = new List<ImpactedEntity>(),
                    Warnings = new List<string>()
                };

                impact.BlockingDependencies = GetDeleteBlockers(customerId, tenantId);
                foreach (var dep in impact.BlockingDependencies)
                {
                    var hint = dep.Items.Any(i => string.IsNullOrEmpty(i.DeleteEndpoint))
                        ? "Resolve these in their own module first."
                        : "Delete them first.";
                    impact.BlockingReasons.Add($"{dep.Description}: {string.Join(", ", dep.Items.Select(i => i.Name))}. {hint}");
                }
                impact.CanDelete = !impact.BlockingDependencies.Any();

                // If can delete, list what will be deleted
                if (impact.CanDelete)
                {
                    var contactCount = _context.CustomerContact
                        .Count(cc => cc.customer_id == customerId);
                    if (contactCount > 0)
                    {
                        impact.WillBeDeleted.Add(new ImpactedEntity
                        {
                            EntityType = "Contacts",
                            Count = contactCount,
                            Description = $"{contactCount} contact(s) will be deleted"
                        });
                    }

                    var billingAddressCount = _context.CustomerBillingAddress
                        .Count(cb => cb.customer_id == customerId);
                    if (billingAddressCount > 0)
                    {
                        impact.WillBeDeleted.Add(new ImpactedEntity
                        {
                            EntityType = "Billing Addresses",
                            Count = billingAddressCount,
                            Description = $"{billingAddressCount} billing address(es) will be deleted"
                        });
                    }

                    var shippingAddressCount = _context.CustomerShippingAddressNew
                        .Count(cs => cs.customer_id == customerId);
                    if (shippingAddressCount > 0)
                    {
                        impact.WillBeDeleted.Add(new ImpactedEntity
                        {
                            EntityType = "Shipping Addresses",
                            Count = shippingAddressCount,
                            Description = $"{shippingAddressCount} shipping address(es) will be deleted"
                        });
                    }

                    impact.Warnings.Add("This action cannot be undone");
                }

                return Ok(new { result = impact });
            }
            catch (Exception ex)
            {
                return ServerError(ex, "deletion impact");
            }
        }

        [HttpDelete("DeleteCustomer")]
        public IActionResult DeleteCustomer([FromQuery] int customerId, [FromQuery] int tenantId)
        {
            try
            {
                var customer = _context.CustomerMaster
                    .FirstOrDefault(c => c.customer_id == customerId && c.Tenantid == tenantId);

                if (customer == null)
                {
                    return NotFound(new { error = "Customer not found" });
                }

                using var tx = _context.Database.BeginTransaction(System.Data.IsolationLevel.Serializable);

                var blockers = GetDeleteBlockers(customerId, tenantId);
                if (blockers.Any())
                {
                    tx.Rollback();
                    return Conflict(new
                    {
                        error = "This customer is still used by other documents and cannot be deleted: "
                            + string.Join("; ", blockers.Select(b => b.Description)) + ".",
                        blockingDependencies = blockers
                    });
                }

                var contacts = _context.CustomerContact
                    .Where(cc => cc.customer_id == customerId)
                    .ToList();
                _context.CustomerContact.RemoveRange(contacts);

                var billingAddresses = _context.CustomerBillingAddress
                    .Where(cb => cb.customer_id == customerId)
                    .ToList();
                _context.CustomerBillingAddress.RemoveRange(billingAddresses);

                var shippingAddresses = _context.CustomerShippingAddressNew
                    .Where(cs => cs.customer_id == customerId)
                    .ToList();
                _context.CustomerShippingAddressNew.RemoveRange(shippingAddresses);

                _context.CustomerMaster.Remove(customer);
                _context.SaveChanges();
                tx.Commit();

                return Ok(new { result = new { message = "Customer deleted successfully" } });
            }
            catch (Exception ex)
            {
                return ServerError(ex, "delete");
            }
        }

        private string BuildFullAddress(string address, string city, string state, string zip)
        {
            var addressParts = new List<string>();
            
            if (!string.IsNullOrWhiteSpace(address))
                addressParts.Add(address);
            
            if (!string.IsNullOrWhiteSpace(city))
                addressParts.Add(city);
            
            if (!string.IsNullOrWhiteSpace(state) || !string.IsNullOrWhiteSpace(zip))
            {
                var stateZip = string.IsNullOrWhiteSpace(state) 
                    ? zip 
                    : string.IsNullOrWhiteSpace(zip) 
                        ? state 
                        : $"{state} {zip}";
                addressParts.Add(stateZip);
            }
            
            return addressParts.Count > 0 ? string.Join(", ", addressParts) : "";
        }
    }

    // Request DTO
    public class CustomerMasterReq
    {
        public int customer_id { get; set; }
        public string company_name { get; set; }
        public string companyAlias { get; set; }
        public string email { get; set; }
        public string phone_number { get; set; }
        public string address { get; set; }
        public string apartment { get; set; }
        public string City { get; set; }
        public string states { get; set; }
        public string zip { get; set; }
        public string country { get; set; }
        public string shippingAddress { get; set; }
        public string shippingCity { get; set; }
        public string shippingStates { get; set; }
        public string shippingCountry { get; set; }
        public string shippingZipCode { get; set; }
        public string shippingApartment { get; set; }
        public string status { get; set; }
        public int TenantID { get; set; }
        public List<CustomerContactReq> CustomerContact { get; set; }
    }

    public class CustomerContactReq
    {
        public int id { get; set; }
        public int customer_id { get; set; }
        public string title { get; set; }
        public string firstname { get; set; }
        public string lastname { get; set; }
        public string phoneno { get; set; }
        public string email { get; set; }
        public bool isDefault { get; set; }
    }

    public class CustomerImportRequest
    {
        public int Tenantid { get; set; }
        public bool UpdateExisting { get; set; } = true;
        public bool StopOnError { get; set; } = false;
        public List<CustomerImportRow> Rows { get; set; } = new();
    }

    public class CustomerImportRow
    {
        public int? RowNumber { get; set; }
        public string? CustomerCode { get; set; }
        public string? CompanyName { get; set; }
        public string? CompanyAlias { get; set; }
        public string? Email { get; set; }
        public string? Phone { get; set; }
        public string? Address { get; set; }
        public string? Apartment { get; set; }
        public string? City { get; set; }
        public string? State { get; set; }
        public string? Zip { get; set; }
        public string? Country { get; set; }
        public string? ShippingAddress { get; set; }
        public string? ShippingApartment { get; set; }
        public string? ShippingCity { get; set; }
        public string? ShippingState { get; set; }
        public string? ShippingZip { get; set; }
        public string? ShippingCountry { get; set; }
        public string? Status { get; set; }
        public string? ContactTitle { get; set; }
        public string? ContactFirstName { get; set; }
        public string? ContactLastName { get; set; }
        public string? ContactPhone { get; set; }
        public string? ContactEmail { get; set; }
    }

    public class CustomerImportResult
    {
        public int Created { get; set; }
        public int Updated { get; set; }
        public int Skipped { get; set; }
        public int Failed { get; set; }
        public List<CustomerImportRowResult> Rows { get; set; } = new();
    }

    public class CustomerImportRowResult
    {
        public int RowNumber { get; set; }
        public int? CustomerId { get; set; }
        public string Status { get; set; } = "";
        public string Message { get; set; } = "";
        public string? Warning { get; set; }
    }
}

