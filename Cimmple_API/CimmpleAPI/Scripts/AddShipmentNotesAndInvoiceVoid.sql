-- Persist shipment notes and customer-invoice void flag.
-- Must run against CimmpleERPDB (not master). Safe to re-run.

IF DB_ID(N'CimmpleERPDB') IS NOT NULL
    USE CimmpleERPDB;
GO

DECLARE @shipping nvarchar(256) =
    CASE
        WHEN OBJECT_ID(N'CimmpleFlow.Shipping', N'U') IS NOT NULL THEN N'CimmpleFlow.Shipping'
        WHEN OBJECT_ID(N'cimmpleflow.Shipping', N'U') IS NOT NULL THEN N'cimmpleflow.Shipping'
        WHEN OBJECT_ID(N'dbo.Shipping', N'U') IS NOT NULL THEN N'dbo.Shipping'
        ELSE NULL
    END;

DECLARE @invoice nvarchar(256) =
    CASE
        WHEN OBJECT_ID(N'CimmpleFlow.InvoiceMaster', N'U') IS NOT NULL THEN N'CimmpleFlow.InvoiceMaster'
        WHEN OBJECT_ID(N'cimmpleflow.InvoiceMaster', N'U') IS NOT NULL THEN N'cimmpleflow.InvoiceMaster'
        WHEN OBJECT_ID(N'dbo.InvoiceMaster', N'U') IS NOT NULL THEN N'dbo.InvoiceMaster'
        ELSE NULL
    END;

IF @shipping IS NULL OR @invoice IS NULL
BEGIN
    DECLARE @msg nvarchar(400) = N'Shipping/InvoiceMaster not found in database [' + DB_NAME() +
        N']. In SSMS, set the database dropdown to CimmpleERPDB and run again.';
    THROW 50001, @msg, 1;
END

DECLARE @sql nvarchar(max);

IF COL_LENGTH(@shipping, N'Notes') IS NULL
BEGIN
    SET @sql = N'ALTER TABLE ' + @shipping + N' ADD Notes nvarchar(max) NULL;';
    EXEC sp_executesql @sql;
    PRINT 'Added Notes to ' + @shipping;
END
ELSE
    PRINT 'Notes already exists on ' + @shipping;

IF COL_LENGTH(@invoice, N'IsVoided') IS NULL
BEGIN
    SET @sql = N'ALTER TABLE ' + @invoice + N' ADD IsVoided bit NOT NULL CONSTRAINT DF_InvoiceMaster_IsVoided DEFAULT (0);';
    EXEC sp_executesql @sql;
    PRINT 'Added IsVoided to ' + @invoice;
END
ELSE
    PRINT 'IsVoided already exists on ' + @invoice;

IF OBJECT_ID(N'CimmpleFlow.__EFMigrationsHistory', N'U') IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM CimmpleFlow.__EFMigrationsHistory
    WHERE MigrationId = N'20260819120000_AddShipmentNotesAndInvoiceVoid'
)
    INSERT INTO CimmpleFlow.__EFMigrationsHistory (MigrationId, ProductVersion)
    VALUES (N'20260819120000_AddShipmentNotesAndInvoiceVoid', N'7.0.0');
GO
