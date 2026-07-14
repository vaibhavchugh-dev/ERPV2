using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    public class BankMaster
    {
        [Key]
        public int Id { get; set; }
        public string BankName { get; set; }
        public string AccountNo { get; set; }
        public decimal Balance { get; set; }
        public int TenantId { get; set; }
        public string coa { get; set; }
        public int locationId { get; set; }
        public string Phone { get; set; }
        public string Email { get; set; }
        public string RoutingNumber { get; set; }
        public string AccountType { get; set; }
        public string accountname { get; set; }
        public string displayname { get; set; }
        public string Bankcode { get; set; }
        public string BankStreet1 { get; set; }
        public string BankStreet2 { get; set; }
        public string status { get; set; }
        public int? abarounting { get; set; }
        public int? startingcheck { get; set; }
        public string checkseries { get; set; }
        public string street { get; set; }
        public string apartment { get; set; }
        public string city { get; set; }
        public string state { get; set; }
        public string zip { get; set; }
        public string country { get; set; }
        public string lastAccountNo { get; set; }
        public int? sharingid { get; set; }
        public string NickName { get; set; }
        public bool? ispayrollDefault { get; set; }
        public bool? isprimary { get; set; }
    }

    public class BankCOAMapping
    {
        [Key]
        public int id { get; set; }
        public int bankid { get; set; }
        public int accountid { get; set; }
    }
}


