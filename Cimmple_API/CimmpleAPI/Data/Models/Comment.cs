using System;
using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    public class Comment
    {
        [Key]
        public int Id { get; set; }
        public string EntryType { get; set; }
        public string UniqueNo { get; set; }
        public string Comments { get; set; }
        public int TenantId { get; set; }
        public int CreatedBy { get; set; }
        public DateTime CreatedOn { get; set; }
        public int CreatedFor { get; set; }
        public bool MailSent { get; set; }
        public bool Readed { get; set; }
    }
}







