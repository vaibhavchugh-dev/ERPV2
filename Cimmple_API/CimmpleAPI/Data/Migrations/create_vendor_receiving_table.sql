-- =============================================
-- Create VendorReceiving Table
-- Migration: 20260112175010_AddVendorReceiving
-- =============================================

-- Create VendorReceiving table if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[VendorReceiving]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[VendorReceiving] (
        [ID] int NOT NULL IDENTITY(1,1),
        [VendorOrderDetailID] int NOT NULL,
        [ReceivedQty] int NOT NULL,
        [ReceivedDate] datetime2 NOT NULL,
        [ReceivedBy] int NOT NULL,
        [LocationId] int NULL,
        [Notes] nvarchar(max) NULL,
        [Tenantid] int NOT NULL,
        CONSTRAINT [PK_VendorReceiving] PRIMARY KEY ([ID]),
        CONSTRAINT [FK_VendorReceiving_VendorOrderDetails_VendorOrderDetailID] 
            FOREIGN KEY ([VendorOrderDetailID]) 
            REFERENCES [dbo].[VendorOrderDetails] ([ID]) 
            ON DELETE CASCADE
    );

    -- Create index for better query performance
    CREATE INDEX [IX_VendorReceiving_VendorOrderDetailID] 
        ON [dbo].[VendorReceiving] ([VendorOrderDetailID]);

    PRINT 'VendorReceiving table created successfully.';
END
ELSE
BEGIN
    PRINT 'VendorReceiving table already exists.';
END
GO

-- Mark the migration as applied in the migration history table
IF NOT EXISTS (SELECT * FROM [dbo].[__EFMigrationsHistory] WHERE [MigrationId] = N'20260112175010_AddVendorReceiving')
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
    VALUES (N'20260112175010_AddVendorReceiving', N'7.0.0');

    PRINT 'Migration 20260112175010_AddVendorReceiving marked as applied.';
END
ELSE
BEGIN
    PRINT 'Migration 20260112175010_AddVendorReceiving already marked as applied.';
END
GO

PRINT 'Script completed successfully.';
GO
































