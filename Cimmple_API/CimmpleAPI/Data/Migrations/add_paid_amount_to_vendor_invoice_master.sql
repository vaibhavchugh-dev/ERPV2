-- Add PaidAmount for partial vendor invoice payments
USE ERPv2Db
IF COL_LENGTH('VendorInvoiceMaster', 'PaidAmount') IS NULL
BEGIN
    ALTER TABLE [VendorInvoiceMaster] ADD [PaidAmount] decimal(18,2) NOT NULL CONSTRAINT DF_VendorInvoiceMaster_PaidAmount DEFAULT (0);
END
GO

UPDATE [VendorInvoiceMaster]
SET [PaidAmount] = [TotalAmount]
WHERE ([isPaid] = 1 OR [Paydate] IS NOT NULL)
  AND [PaidAmount] = 0;
GO
