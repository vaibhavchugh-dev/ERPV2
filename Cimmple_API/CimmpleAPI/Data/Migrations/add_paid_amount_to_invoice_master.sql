-- Add PaidAmount for partial customer invoice payments
USE ERPv2Db
IF COL_LENGTH('InvoiceMaster', 'PaidAmount') IS NULL
BEGIN
    ALTER TABLE [InvoiceMaster] ADD [PaidAmount] decimal(18,2) NOT NULL CONSTRAINT DF_InvoiceMaster_PaidAmount DEFAULT (0);
END
GO

-- Backfill legacy fully-paid invoices (PaymentDate was the paid flag)
UPDATE [InvoiceMaster]
SET [PaidAmount] = [TotalAmount]
WHERE [PaymentDate] IS NOT NULL
  AND [PaidAmount] = 0;
GO
