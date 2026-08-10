using System;
using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    public class VendorMaster
    {
        [Key]
        public int vendor_id { get; set; }
        public string company_name { get; set; }
        public string companyAlias { get; set; }
        public string firstname { get; set; }
        public string last_name { get; set; }
        public string email { get; set; }
        public string status { get; set; }
        public string address { get; set; }
        public string apartment { get; set; }
        public string country { get; set; }
        public string phone_number { get; set; }
        public DateTime? registration_date { get; set; }
        public DateTime? last_login_date { get; set; }
        public string ContactEmail { get; set; }
        public string WebAddress { get; set; }
        public int Tenantid { get; set; }
        public string ship_via { get; set; }
        public string term { get; set; }
        public string city { get; set; }
        public string state { get; set; }
        public string zip { get; set; }
        public string vendorcode { get; set; }
        public string shippingAddress { get; set; }
        public string shippingCity { get; set; }
        public string shippingStates { get; set; }
        public string shippingCountry { get; set; }
        public string shippingZipCode { get; set; }
        public string shippingApartment { get; set; }
    }

    public class VendorContact
    {
        [Key]
        public int id { get; set; }
        public int customer_id { get; set; }
        public string title { get; set; }
        public string firstname { get; set; }
        public string lastname { get; set; }
        public string phoneno { get; set; }
        public string email { get; set; }
        public bool isDefault { get; set; }
    }

    public class VendorBillingAddress
    {
        [Key]
        public int id { get; set; }
        public int customer_id { get; set; }
        public string billing_address_line1 { get; set; }
        public string billing_address_line2 { get; set; }
        public string billing_city { get; set; }
        public string billing_state { get; set; }
        public string billing_country { get; set; }
        public string billing_postal_code { get; set; }
        public int IsDefault { get; set; }
        public int TenantId { get; set; }
    }

    public class VendorShippingAddress
    {
        [Key]
        public int id { get; set; }
        public int customer_id { get; set; }
        public string shippingAddress { get; set; }
        public string shippingCity { get; set; }
        public string shippingStates { get; set; }
        public string shippingCountry { get; set; }
        public string shippingZipCode { get; set; }
        public string shippingApartment { get; set; }
        public int IsDefault { get; set; }
        public string firstname { get; set; }
    }

    public class VendorCOAMapping
    {
        [Key]
        public int id { get; set; }
        public int vendorid { get; set; }
        /// <summary>Accounts Payable control account for this vendor.</summary>
        public int accountid { get; set; }
        /// <summary>Optional default expense account when PO line has no glcode.</summary>
        public int? expenseAccountId { get; set; }
    }
}







