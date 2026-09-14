USE ERPv2Db

-- Azure attachment columns for Vendor Order attachments (mirror OrderAttachment).
IF COL_LENGTH('dbo.VendorOrderAttachments', 'FileUniqueno') IS NULL
BEGIN
    ALTER TABLE dbo.VendorOrderAttachments ADD FileUniqueno INT NOT NULL CONSTRAINT DF_VendorOrderAttachments_FileUniqueno DEFAULT (0);
END
GO

IF COL_LENGTH('dbo.VendorOrderAttachments', 'UploadFile') IS NULL
BEGIN
    ALTER TABLE dbo.VendorOrderAttachments ADD UploadFile NVARCHAR(500) NULL;
END
GO

IF COL_LENGTH('dbo.VendorOrderAttachments', 'TenantID') IS NULL
BEGIN
    ALTER TABLE dbo.VendorOrderAttachments ADD TenantID INT NOT NULL CONSTRAINT DF_VendorOrderAttachments_TenantID DEFAULT (0);
END
GO

IF COL_LENGTH('dbo.VendorOrderAttachments', 'createdby') IS NULL
BEGIN
    ALTER TABLE dbo.VendorOrderAttachments ADD createdby INT NOT NULL CONSTRAINT DF_VendorOrderAttachments_createdby DEFAULT (0);
END
GO
