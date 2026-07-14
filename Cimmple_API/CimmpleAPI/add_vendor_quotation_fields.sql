-- Add missing fields to VendorQuotations and VendorQuotationsDetails tables
-- Run this script to add support for Notes, PartNo, Attachments, and Comments

-- Add AttachmentsJson and CommentsJson to VendorQuotations table
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[VendorQuotations]') AND name = 'AttachmentsJson')
BEGIN
    ALTER TABLE [dbo].[VendorQuotations]
    ADD [AttachmentsJson] NVARCHAR(MAX) NULL;
    PRINT 'Added AttachmentsJson column to VendorQuotations';
END
ELSE
BEGIN
    PRINT 'AttachmentsJson column already exists in VendorQuotations';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[VendorQuotations]') AND name = 'CommentsJson')
BEGIN
    ALTER TABLE [dbo].[VendorQuotations]
    ADD [CommentsJson] NVARCHAR(MAX) NULL;
    PRINT 'Added CommentsJson column to VendorQuotations';
END
ELSE
BEGIN
    PRINT 'CommentsJson column already exists in VendorQuotations';
END
GO

-- Add notes and PartNo to VendorQuotationsDetails table
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[VendorQuotationsDetails]') AND name = 'notes')
BEGIN
    ALTER TABLE [dbo].[VendorQuotationsDetails]
    ADD [notes] NVARCHAR(MAX) NULL;
    PRINT 'Added notes column to VendorQuotationsDetails';
END
ELSE
BEGIN
    PRINT 'notes column already exists in VendorQuotationsDetails';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[VendorQuotationsDetails]') AND name = 'PartNo')
BEGIN
    ALTER TABLE [dbo].[VendorQuotationsDetails]
    ADD [PartNo] NVARCHAR(MAX) NULL;
    PRINT 'Added PartNo column to VendorQuotationsDetails';
END
ELSE
BEGIN
    PRINT 'PartNo column already exists in VendorQuotationsDetails';
END
GO

-- Add AttachmentsJson to VendorQuotationsDetails table
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[VendorQuotationsDetails]') AND name = 'AttachmentsJson')
BEGIN
    ALTER TABLE [dbo].[VendorQuotationsDetails]
    ADD [AttachmentsJson] NVARCHAR(MAX) NULL;
    PRINT 'Added AttachmentsJson column to VendorQuotationsDetails';
END
ELSE
BEGIN
    PRINT 'AttachmentsJson column already exists in VendorQuotationsDetails';
END
GO

PRINT 'Migration completed successfully!';




