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
    [AllowAnonymous]
    public class CustomerController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;

        public CustomerController(CimmpleDbContext context)
        {
            _context = context;
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
                return StatusCode(500, new { error = ex.Message });
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
                return StatusCode(500, new { error = ex.Message });
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

                var existingCustomer = _context.CustomerMaster
                    .FirstOrDefault(c => c.customer_id == request.customer_id && c.Tenantid == request.TenantID);

                CustomerMaster customer;
                bool isNew = existingCustomer == null;

                if (isNew)
                {
                    customer = new CustomerMaster();
                    // Generate customer code
                    var maxCode = _context.CustomerMaster
                        .Where(c => c.Tenantid == request.TenantID)
                        .Count();
                    customer.customercode = $"C{(maxCode + 1001)}";
                }
                else
                {
                    customer = existingCustomer;
                }

                // Update customer properties
                customer.company_name = request.company_name;
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
                customer.status = request.status ?? "Active";
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
                var errorMessage = ex.Message;
                if (ex.InnerException != null)
                {
                    errorMessage += " | Inner Exception: " + ex.InnerException.Message;
                }
                return StatusCode(500, new { error = errorMessage, stackTrace = ex.StackTrace });
            }
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

                // Check for Customer Orders
                var customerOrders = _context.CustomerOrder
                    .Where(co => co.CustomerID == customerId && co.Tenantid == tenantId)
                    .ToList();

                if (customerOrders.Any())
                {
                    var orderDependency = new BlockingDependency
                    {
                        EntityType = "CustomerOrder",
                        Description = $"Customer has {customerOrders.Count} order(s) associated",
                        Items = customerOrders.Select(co => new DependencyItem
                        {
                            Id = co.OrderID,
                            Name = $"CO#{co.PONumber}",
                            DeleteEndpoint = $"/Order/DeleteOrder?orderId={co.OrderID}&tenantId={tenantId}"
                        }).ToList()
                    };

                    impact.BlockingDependencies.Add(orderDependency);
                    impact.BlockingReasons.Add(
                        $"Customer has {customerOrders.Count} order(s) associated: {string.Join(", ", customerOrders.Select(co => $"CO#{co.PONumber}"))}. Delete orders first."
                    );
                    impact.CanDelete = false;
                }

                // Check for Customer Quotations
                var quotations = _context.QuotationOrder
                    .Where(q => q.CustomerID == customerId && q.Tenantid == tenantId)
                    .ToList();

                if (quotations.Any())
                {
                    var quotationDependency = new BlockingDependency
                    {
                        EntityType = "Quotation",
                        Description = $"Customer has {quotations.Count} quotation(s) associated",
                        Items = quotations.Select(q => new DependencyItem
                        {
                            Id = q.OrderID,
                            Name = $"Q#{q.PONumber}",
                            DeleteEndpoint = $"/Quotation/DeleteQuotation?quotationId={q.OrderID}&tenantId={tenantId}"
                        }).ToList()
                    };

                    impact.BlockingDependencies.Add(quotationDependency);
                    impact.BlockingReasons.Add(
                        $"Customer has {quotations.Count} quotation(s) associated: {string.Join(", ", quotations.Select(q => $"Q#{q.PONumber}"))}. Delete quotations first."
                    );
                    impact.CanDelete = false;
                }

                // Check for Invoices (through InvoiceDetail -> CustomerOrder)
                var invoices = _context.InvoiceMaster
                    .Join(_context.InvoiceDetail,
                        im => im.Id,
                        id => id.InvoiceId,
                        (im, id) => new { Invoice = im, Detail = id })
                    .Join(_context.CustomerOrder,
                        x => x.Detail.OrderId,
                        co => co.OrderID,
                        (x, co) => new { x.Invoice, Order = co })
                    .Where(x => x.Order.CustomerID == customerId && x.Invoice.TenantId == tenantId)
                    .Select(x => x.Invoice)
                    .Distinct()
                    .ToList();

                if (invoices.Any())
                {
                    var invoiceDependency = new BlockingDependency
                    {
                        EntityType = "Invoice",
                        Description = $"Customer has {invoices.Count} invoice(s) associated",
                    Items = invoices.Select(im => new DependencyItem
                    {
                        Id = im.Id,
                        Name = im.InvoiceNo > 0 ? $"Invoice #{im.InvoiceNo}" : $"Invoice #{im.Id}",
                        DeleteEndpoint = $"/Invoice/DeleteInvoice/{im.Id}"
                    }).ToList()
                    };

                    impact.BlockingDependencies.Add(invoiceDependency);
                    impact.BlockingReasons.Add(
                        $"Customer has {invoices.Count} invoice(s) associated: {string.Join(", ", invoices.Select(im => im.InvoiceNo > 0 ? $"Invoice #{im.InvoiceNo}" : $"Invoice #{im.Id}"))}. Delete invoices first."
                    );
                    impact.CanDelete = false;
                }

                // Check for Shipments (through Shipping -> CustomerOrder)
                var shipments = _context.Shipping
                    .Join(_context.CustomerOrder,
                        s => s.OrderId,
                        co => co.OrderID,
                        (s, co) => new { Shipment = s, Order = co })
                    .Where(x => x.Order.CustomerID == customerId && x.Shipment.TenantId == tenantId)
                    .Select(x => x.Shipment)
                    .ToList();

                if (shipments.Any())
                {
                    var shipmentDependency = new BlockingDependency
                    {
                        EntityType = "Shipment",
                        Description = $"Customer has {shipments.Count} shipment(s) associated",
                        Items = shipments.Select(s => new DependencyItem
                        {
                            Id = s.Id,
                            Name = s.ShipmentNo ?? $"Shipment #{s.Id}",
                            DeleteEndpoint = $"/Shipping/DeleteShipment/{s.Id}"
                        }).ToList()
                    };

                    impact.BlockingDependencies.Add(shipmentDependency);
                    impact.BlockingReasons.Add(
                        $"Customer has {shipments.Count} shipment(s) associated: {string.Join(", ", shipments.Select(s => s.ShipmentNo ?? $"Shipment #{s.Id}"))}. Delete shipments first."
                    );
                    impact.CanDelete = false;
                }

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
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
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

                // Delete related entities
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

                // Delete the customer
                _context.CustomerMaster.Remove(customer);
                _context.SaveChanges();

                return Ok(new { result = new { message = "Customer deleted successfully" } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
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
}

