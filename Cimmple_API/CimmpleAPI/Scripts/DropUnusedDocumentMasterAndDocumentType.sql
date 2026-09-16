-- Migration: 20260916120000_DropUnusedDocumentMasterAndDocumentType
-- Purpose: Drop unused DocumentMaster / DocumentType leftovers (live docs use Documents).
-- Safe / idempotent for SSMS. Run against your ERP database (e.g. CimmpleERPDB).

SET NOCOUNT ON;
GO

-- Drop from CimmpleFlow (EF default schema) if present
IF OBJECT_ID(N'CimmpleFlow.DocumentMaster', N'U') IS NOT NULL
BEGIN
    DROP TABLE [CimmpleFlow].[DocumentMaster];
    PRINT 'Dropped CimmpleFlow.DocumentMaster';
END
ELSE
    PRINT 'CimmpleFlow.DocumentMaster not found (ok)';
GO

IF OBJECT_ID(N'CimmpleFlow.DocumentType', N'U') IS NOT NULL
BEGIN
    DROP TABLE [CimmpleFlow].[DocumentType];
    PRINT 'Dropped CimmpleFlow.DocumentType';
END
ELSE
    PRINT 'CimmpleFlow.DocumentType not found (ok)';
GO

-- Drop from dbo if leftover from InitialCreate (created without schema)
IF OBJECT_ID(N'dbo.DocumentMaster', N'U') IS NOT NULL
BEGIN
    DROP TABLE [dbo].[DocumentMaster];
    PRINT 'Dropped dbo.DocumentMaster';
END
ELSE
    PRINT 'dbo.DocumentMaster not found (ok)';
GO

IF OBJECT_ID(N'dbo.DocumentType', N'U') IS NOT NULL
BEGIN
    DROP TABLE [dbo].[DocumentType];
    PRINT 'Dropped dbo.DocumentType';
END
ELSE
    PRINT 'dbo.DocumentType not found (ok)';
GO

-- Record EF migration (this DB keeps history in dbo, not CimmpleFlow)
IF OBJECT_ID(N'dbo.__EFMigrationsHistory', N'U') IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM [dbo].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260916120000_DropUnusedDocumentMasterAndDocumentType'
)
BEGIN
    INSERT INTO [dbo].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260916120000_DropUnusedDocumentMasterAndDocumentType', N'7.0.0');
    PRINT 'Recorded migration in dbo.__EFMigrationsHistory';
END
ELSE IF OBJECT_ID(N'CimmpleFlow.__EFMigrationsHistory', N'U') IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM [CimmpleFlow].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260916120000_DropUnusedDocumentMasterAndDocumentType'
)
BEGIN
    INSERT INTO [CimmpleFlow].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260916120000_DropUnusedDocumentMasterAndDocumentType', N'7.0.0');
    PRINT 'Recorded migration in CimmpleFlow.__EFMigrationsHistory';
END
ELSE IF OBJECT_ID(N'dbo.__EFMigrationsHistory', N'U') IS NULL
    AND OBJECT_ID(N'CimmpleFlow.__EFMigrationsHistory', N'U') IS NULL
    PRINT 'WARNING: __EFMigrationsHistory table not found — drops already done; record manually if needed';
ELSE
    PRINT 'Migration history already recorded (ok)';
GO

PRINT 'Done.';
GO
