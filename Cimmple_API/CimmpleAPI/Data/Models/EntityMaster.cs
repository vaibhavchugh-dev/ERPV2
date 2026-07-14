using System;
using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    public class EntityMaster
    {
        [Key]
        public int entityid { get; set; }
        public string company_name { get; set; }
        public string first_name { get; set; }
        public string last_name { get; set; }
        public string email { get; set; }
        public string phone_number { get; set; }
        public DateTime? registration_date { get; set; }
        public DateTime? last_login_date { get; set; }
        public int Tenantid { get; set; }
        public string pointofcontact { get; set; }
        public string ContactEmail { get; set; }
        public string WebAddress { get; set; }
        public string address { get; set; }
        public string apartment { get; set; }
        public string country { get; set; }
        public string entitycode { get; set; }
        public string city { get; set; }
        public string state { get; set; }
        public string zip { get; set; }
        public decimal SaleTax { get; set; }
        public string QuotationPrefix { get; set; }
        public string CustomerPrefix { get; set; }
        public string VendorPrefix { get; set; }
        public string ShippingPrefix { get; set; }
        public string InvoicePrefix { get; set; }
        public string timezoneui { get; set; }
        public string timezone { get; set; }
        public int coacount { get; set; }
    }
}







