using System;
using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    public class UserPasswordHistory
    {
        [Key]
        public int Id { get; set; }
        public int UserId { get; set; }
        public int TenantId { get; set; }
        public string PasswordHash { get; set; } = "";
        public string PasswordSalt { get; set; } = "";
        public DateTime CreatedDate { get; set; }
    }
}
