using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    public class CreditCardMaster
    {
        [Key]
        public int Id { get; set; }
        public string CardNumber { get; set; } = "";
        public string LastFourDigits { get; set; } = "";
        public string CardholderName { get; set; } = "";
        public string CardType { get; set; } = ""; // Visa, Mastercard, Amex, etc.
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
        public int Status { get; set; } = 1; // 1 = Active, 0 = Inactive
        public int TenantId { get; set; }
        public string NickName { get; set; } = "";
        public bool? IsPrimary { get; set; } = false;
        public string COA { get; set; } = "";
    }
}

