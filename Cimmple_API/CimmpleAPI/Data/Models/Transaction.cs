using System;
using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    public class Transactions
    {
        [Key]
        public int TransactionID { get; set; }
        public string? TransactionType { get; set; }
        public string? PaymentMethod { get; set; }
        public decimal? Amount { get; set; }
        public DateTime? TransactionDate { get; set; }
        public DateTime? dueDate { get; set; }
        public DateTime? invoiceDate { get; set; }
        public string? invoiceNo { get; set; }
        public string? AccountingPeriod { get; set; }
        public string? Description { get; set; }
        public string? CheckNo { get; set; }
        public int? TenantId { get; set; }
        public int locationId { get; set; }
        public int? BankId { get; set; }
        public int? vendorid { get; set; }
        public int? contractid { get; set; }
        public bool? approved { get; set; }
        public int? isCustomer { get; set; }
    }

    public class Deposits
    {
        [Key]
        public int DepositID { get; set; }
        public int TransactionID { get; set; }
        public int? splitLocationid { get; set; }
        public int AccountID { get; set; }
        public string? DepositDetails { get; set; }
        public string? InternalNotes { get; set; }
        public decimal Amount { get; set; }
        public int TenantID { get; set; }
        public int? adjustmentId { get; set; }
        public int? banksyncId { get; set; }
        public string? ReconcileCL { get; set; }
    }

    public class Withdrawals
    {
        [Key]
        public int WithdrawalID { get; set; }
        public int TransactionID { get; set; }
        public int? splitLocationid { get; set; }
        public int AccountID { get; set; }
        public string? WithdrawalDetails { get; set; }
        public string? InternalNotes { get; set; }
        public decimal Amount { get; set; }
        public int TenantID { get; set; }
        public int? adjustmentId { get; set; }
        public int? banksyncId { get; set; }
        public string? ReconcileCL { get; set; }
    }

    public class Transfer
    {
        [Key]
        public int TransferID { get; set; }
        public DateTime? TransferDate { get; set; }
        public int SourceAccountID { get; set; }
        public int accountidfrom { get; set; }
        public int accountidto { get; set; }
        public string? ReferenceNumber { get; set; }
        public decimal Amount { get; set; }
        public string? Description { get; set; }
        public int TenantID { get; set; }
        public int locationId { get; set; }
    }

    public class JournalEntry
    {
        [Key]
        public int Id { get; set; }
        public DateTime EntryDate { get; set; }
        public string? ReferenceNumber { get; set; }
        public string? Description { get; set; }
        public string? AccountingPeriod { get; set; }
        public int TenantId { get; set; }
        public int locationId { get; set; }
        public int? createdby { get; set; }
        public DateTime? createdDate { get; set; }

        /// <summary>When set, this header is a reversal of the given journal id.</summary>
        public int? ReversesJournalEntryId { get; set; }

        /// <summary>Set on the original entry after a reversal is posted.</summary>
        public int? ReversedByJournalEntryId { get; set; }
    }

    public class JournalDetailsFrom
    {
        [Key]
        public int Id { get; set; }
        public int JournalEntryId { get; set; }
        public int AccountId { get; set; }
        public decimal Amount { get; set; }
        public string? Description { get; set; }
    }

    public class JournalDetailsTo
    {
        [Key]
        public int Id { get; set; }
        public int JournalEntryId { get; set; }
        public int AccountId { get; set; }
        public decimal Amount { get; set; }
        public string? Description { get; set; }
    }

    public class TransCoa
    {
        [Key]
        public int Uniqueno { get; set; }
        public int Tenantid { get; set; }
        public int Transid { get; set; }
        public int accountid { get; set; }
        public string? Transname { get; set; }
    }
}







