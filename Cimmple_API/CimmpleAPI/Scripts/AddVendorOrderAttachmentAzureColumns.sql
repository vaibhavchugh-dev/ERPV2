USE ERPv2Db

-- Azure attachment columns for Vendor Order attachments (mirror OrderAttachment).
-- EF uses CimmpleFlow; also patch dbo for legacy installs.

IF COL_LENGTH(N'CimmpleFlow.VendorOrderAttachments', N'FileUniqueno') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.VendorOrderAttachments ADD FileUniqueno INT NOT NULL CONSTRAINT DF_CF_VOA_FileUniqueno DEFAULT (0);
END
GO

IF COL_LENGTH(N'CimmpleFlow.VendorOrderAttachments', N'UploadFile') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.VendorOrderAttachments ADD UploadFile NVARCHAR(500) NULL;
END
GO

IF COL_LENGTH(N'CimmpleFlow.VendorOrderAttachments', N'TenantID') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.VendorOrderAttachments ADD TenantID INT NOT NULL CONSTRAINT DF_CF_VOA_TenantID DEFAULT (0);
END
GO

IF COL_LENGTH(N'CimmpleFlow.VendorOrderAttachments', N'createdby') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.VendorOrderAttachments ADD createdby INT NOT NULL CONSTRAINT DF_CF_VOA_createdby DEFAULT (0);
END
GO

IF COL_LENGTH(N'dbo.VendorOrderAttachments', N'FileUniqueno') IS NULL AND OBJECT_ID(N'dbo.VendorOrderAttachments', N'U') IS NOT NULL
BEGIN
    ALTER TABLE dbo.VendorOrderAttachments ADD FileUniqueno INT NOT NULL CONSTRAINT DF_VendorOrderAttachments_FileUniqueno DEFAULT (0);
END
GO

IF COL_LENGTH(N'dbo.VendorOrderAttachments', N'UploadFile') IS NULL AND OBJECT_ID(N'dbo.VendorOrderAttachments', N'U') IS NOT NULL
BEGIN
    ALTER TABLE dbo.VendorOrderAttachments ADD UploadFile NVARCHAR(500) NULL;
END
GO

IF COL_LENGTH(N'dbo.VendorOrderAttachments', N'TenantID') IS NULL AND OBJECT_ID(N'dbo.VendorOrderAttachments', N'U') IS NOT NULL
BEGIN
    ALTER TABLE dbo.VendorOrderAttachments ADD TenantID INT NOT NULL CONSTRAINT DF_VendorOrderAttachments_TenantID DEFAULT (0);
END
GO

IF COL_LENGTH(N'dbo.VendorOrderAttachments', N'createdby') IS NULL AND OBJECT_ID(N'dbo.VendorOrderAttachments', N'U') IS NOT NULL
BEGIN
    ALTER TABLE dbo.VendorOrderAttachments ADD createdby INT NOT NULL CONSTRAINT DF_VendorOrderAttachments_createdby DEFAULT (0);
END
GO
