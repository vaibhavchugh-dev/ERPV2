-- =============================================
-- Create VendorInvoicing Table and Add VendorOrderDetailID to VendorInvoiceDetail
-- Migration: 20260113000000_AddVendorInvoicing
-- =============================================

-- Step 1: Add VendorOrderDetailID column to VendorInvoiceDetail table if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[VendorInvoiceDetail]') AND name = 'VendorOrderDetailID')
BEGIN
    ALTER TABLE [dbo].[VendorInvoiceDetail]
    ADD [VendorOrderDetailID] int NULL;

    PRINT 'VendorOrderDetailID column added to VendorInvoiceDetail table.';
END
ELSE
BEGIN
    PRINT 'VendorOrderDetailID column already exists in VendorInvoiceDetail table.';
END
GO

-- Step 2: Create VendorInvoicing table if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[VendorInvoicing]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[VendorInvoicing] (
        [ID] int NOT NULL IDENTITY(1,1),
        [VendorInvoiceDetailID] int NOT NULL,
        [VendorOrderDetailID] int NOT NULL,
        [InvoicedQty] int NOT NULL,
        [InvoicedDate] datetime2 NOT NULL,
        [InvoicedBy] int NOT NULL,
        [LocationId] int NULL,
        [Notes] nvarchar(max) NULL,
        [Tenantid] int NOT NULL,
        CONSTRAINT [PK_VendorInvoicing] PRIMARY KEY ([ID]),
        CONSTRAINT [FK_VendorInvoicing_VendorInvoiceDetail_VendorInvoiceDetailID] 
            FOREIGN KEY ([VendorInvoiceDetailID]) 
            REFERENCES [dbo].[VendorInvoiceDetail] ([Id]) 
            ON DELETE CASCADE,
        CONSTRAINT [FK_VendorInvoicing_VendorOrderDetails_VendorOrderDetailID] 
            FOREIGN KEY ([VendorOrderDetailID]) 
            REFERENCES [dbo].[VendorOrderDetails] ([ID]) 
            ON DELETE NO ACTION
    );

    -- Create indexes for better query performance
    CREATE INDEX [IX_VendorInvoicing_VendorInvoiceDetailID] 
        ON [dbo].[VendorInvoicing] ([VendorInvoiceDetailID]);

    CREATE INDEX [IX_VendorInvoicing_VendorOrderDetailID] 
        ON [dbo].[VendorInvoicing] ([VendorOrderDetailID]);

    CREATE INDEX [IX_VendorInvoicing_Tenantid] 
        ON [dbo].[VendorInvoicing] ([Tenantid]);

    PRINT 'VendorInvoicing table created successfully.';
END
ELSE
BEGIN
    PRINT 'VendorInvoicing table already exists.';
END
GO

-- Mark the migration as applied in the migration history table
IF NOT EXISTS (SELECT * FROM [dbo].[__EFMigrationsHistory] WHERE [MigrationId] = N'20260113000000_AddVendorInvoicing')
BEGIN
    -- Check if __EFMigrationsHistory table exists, create it if not
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[__EFMigrationsHistory]') AND type in (N'U'))
    BEGIN
        CREATE TABLE [dbo].[__EFMigrationsHistory] (
            [MigrationId] nvarchar(150) NOT NULL,
            [ProductVersion] nvarchar(32) NOT NULL,
            CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
        );
    END

    INSERT INTO [dbo].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260113000000_AddVendorInvoicing', N'7.0.0');

    PRINT 'Migration 20260113000000_AddVendorInvoicing marked as applied.';
END
ELSE
BEGIN
    PRINT 'Migration 20260113000000_AddVendorInvoicing already marked as applied.';
END
GO

PRINT 'Script completed successfully.';
GO
































