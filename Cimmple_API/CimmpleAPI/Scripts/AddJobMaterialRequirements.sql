-- Planned material on job templates and job orders. Idempotent.

IF OBJECT_ID(N'CimmpleFlow.JobTemplateMaterial', N'U') IS NULL
BEGIN
    CREATE TABLE [CimmpleFlow].[JobTemplateMaterial] (
        [Id] int IDENTITY(1,1) NOT NULL,
        [JobTemplateId] int NOT NULL,
        [Tenantid] int NOT NULL,
        [SequenceNumber] int NOT NULL,
        [ProductId] int NULL,
        [RawMaterialId] int NULL,
        [Quantity] decimal(18,2) NOT NULL,
        [Notes] nvarchar(200) NULL,
        CONSTRAINT [PK_JobTemplateMaterial] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_JobTemplateMaterial_JobTemplateMaster_JobTemplateId]
            FOREIGN KEY ([JobTemplateId]) REFERENCES [CimmpleFlow].[JobTemplateMaster] ([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_JobTemplateMaterial_ProductMaster_ProductId]
            FOREIGN KEY ([ProductId]) REFERENCES [CimmpleFlow].[ProductMaster] ([Id]),
        CONSTRAINT [FK_JobTemplateMaterial_RawMaterialMaster_RawMaterialId]
            FOREIGN KEY ([RawMaterialId]) REFERENCES [CimmpleFlow].[RawMaterialMaster] ([Id])
    );

    CREATE INDEX [IX_JobTemplateMaterial_JobTemplateId_SequenceNumber]
        ON [CimmpleFlow].[JobTemplateMaterial] ([JobTemplateId], [SequenceNumber]);
END
GO

IF OBJECT_ID(N'CimmpleFlow.JobMaterialRequirement', N'U') IS NULL
BEGIN
    CREATE TABLE [CimmpleFlow].[JobMaterialRequirement] (
        [Id] int IDENTITY(1,1) NOT NULL,
        [JobOrderId] int NOT NULL,
        [Tenantid] int NOT NULL,
        [SequenceNumber] int NOT NULL,
        [ProductId] int NULL,
        [RawMaterialId] int NULL,
        [QuantityNeeded] decimal(18,2) NOT NULL,
        [Notes] nvarchar(200) NULL,
        CONSTRAINT [PK_JobMaterialRequirement] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_JobMaterialRequirement_JobOrderMaster_JobOrderId]
            FOREIGN KEY ([JobOrderId]) REFERENCES [CimmpleFlow].[JobOrderMaster] ([JobOrderID]) ON DELETE CASCADE,
        CONSTRAINT [FK_JobMaterialRequirement_ProductMaster_ProductId]
            FOREIGN KEY ([ProductId]) REFERENCES [CimmpleFlow].[ProductMaster] ([Id]),
        CONSTRAINT [FK_JobMaterialRequirement_RawMaterialMaster_RawMaterialId]
            FOREIGN KEY ([RawMaterialId]) REFERENCES [CimmpleFlow].[RawMaterialMaster] ([Id])
    );

    CREATE INDEX [IX_JobMaterialRequirement_JobOrderId]
        ON [CimmpleFlow].[JobMaterialRequirement] ([JobOrderId]);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM [CimmpleFlow].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817120000_AddJobMaterialRequirements'
)
BEGIN
    INSERT INTO [CimmpleFlow].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260817120000_AddJobMaterialRequirements', N'7.0.0');
END
GO
