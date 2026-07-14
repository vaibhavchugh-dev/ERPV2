-- Manual SQL script to add missing columns for Customer Orders
-- Run this script in SQL Server Management Studio or your SQL client

-- Add columns to CustomerOrder table
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CustomerOrder]') AND name = 'AttachmentsJson')
BEGIN
    ALTER TABLE [dbo].[CustomerOrder]
    ADD [AttachmentsJson] nvarchar(max) NULL;
    PRINT 'Added AttachmentsJson column to CustomerOrder table';
END
ELSE
BEGIN
    PRINT 'AttachmentsJson column already exists in CustomerOrder table';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CustomerOrder]') AND name = 'CommentsJson')
BEGIN
    ALTER TABLE [dbo].[CustomerOrder]
    ADD [CommentsJson] nvarchar(max) NULL;
    PRINT 'Added CommentsJson column to CustomerOrder table';
END
ELSE
BEGIN
    PRINT 'CommentsJson column already exists in CustomerOrder table';
END
GO

-- Add columns to CustomerOrderDetails table
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CustomerOrderDetails]') AND name = 'leadTime')
BEGIN
    ALTER TABLE [dbo].[CustomerOrderDetails]
    ADD [leadTime] nvarchar(max) NOT NULL DEFAULT '';
    PRINT 'Added leadTime column to CustomerOrderDetails table';
END
ELSE
BEGIN
    PRINT 'leadTime column already exists in CustomerOrderDetails table';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CustomerOrderDetails]') AND name = 'notes')
BEGIN
    ALTER TABLE [dbo].[CustomerOrderDetails]
    ADD [notes] nvarchar(max) NOT NULL DEFAULT '';
    PRINT 'Added notes column to CustomerOrderDetails table';
END
ELSE
BEGIN
    PRINT 'notes column already exists in CustomerOrderDetails table';
END
GO

PRINT 'Migration completed successfully!';


