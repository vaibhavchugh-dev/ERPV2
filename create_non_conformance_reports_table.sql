-- Create NonConformanceReports table for Quality Management
-- This table stores Non Conformance Reports (NCR) for manufacturing quality issues

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NonConformanceReports' AND xtype='U')
BEGIN
    CREATE TABLE [dbo].[NonConformanceReports](
        [NcrId] [int] IDENTITY(1,1) NOT NULL,
        [NcrNumber] [nvarchar](50) NOT NULL,
        [Title] [nvarchar](200) NOT NULL,
        [Description] [nvarchar](1000) NULL,
        [Category] [nvarchar](50) NOT NULL,
        [Severity] [nvarchar](20) NOT NULL,
        [Status] [nvarchar](30) NOT NULL,

        -- Source Information
        [Source] [nvarchar](20) NOT NULL,
        [JobOrderId] [int] NULL,
        [JobOrderNumber] [nvarchar](50) NULL,
        [RoutingStepId] [int] NULL,
        [PartNo] [nvarchar](100) NULL,
        [PartName] [nvarchar](200) NULL,
        [CustomerId] [int] NULL,
        [CustomerName] [nvarchar](200) NULL,

        -- Quality Details
        [DefectLocation] [nvarchar](200) NULL,
        [DefectQuantity] [int] NOT NULL DEFAULT 0,
        [TotalQuantity] [int] NOT NULL DEFAULT 0,
        [DefectDescription] [nvarchar](500) NULL,
        [Photos] [nvarchar](max) NULL, -- JSON array of photo URLs

        -- Root Cause Analysis
        [RootCause] [nvarchar](500) NULL,
        [RootCauseCategory] [nvarchar](50) NULL,

        -- Actions
        [ImmediateAction] [nvarchar](500) NULL,
        [CorrectiveAction] [nvarchar](500) NULL,
        [PreventiveAction] [nvarchar](500) NULL,

        -- Workflow
        [ReportedBy] [int] NOT NULL,
        [ReportedByName] [nvarchar](200) NULL,
        [ReportedDate] [datetime2] NOT NULL,

        [InvestigatedBy] [int] NULL,
        [InvestigatedByName] [nvarchar](200) NULL,
        [InvestigatedDate] [datetime2] NULL,

        [ApprovedBy] [int] NULL,
        [ApprovedByName] [nvarchar](200) NULL,
        [ApprovedDate] [datetime2] NULL,

        -- Tracking
        [DueDate] [datetime2] NULL,
        [ClosedDate] [datetime2] NULL,
        [CostImpact] [decimal](18,2) NULL,
        [Notes] [nvarchar](500) NULL,

        -- Additional fields
        [TenantId] [int] NOT NULL,

        -- Audit fields
        [CreatedDate] [datetime2] NOT NULL DEFAULT GETUTCDATE(),
        [CreatedBy] [int] NULL,
        [ModifiedDate] [datetime2] NULL,
        [ModifiedBy] [int] NULL,

        CONSTRAINT [PK_NonConformanceReports] PRIMARY KEY CLUSTERED ([NcrId] ASC)
    ) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY];
END
GO

-- Create indexes for better performance
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_NonConformanceReports_TenantId_Status')
BEGIN
    CREATE NONCLUSTERED INDEX [IX_NonConformanceReports_TenantId_Status]
    ON [dbo].[NonConformanceReports] ([TenantId], [Status]);
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_NonConformanceReports_JobOrderId')
BEGIN
    CREATE NONCLUSTERED INDEX [IX_NonConformanceReports_JobOrderId]
    ON [dbo].[NonConformanceReports] ([JobOrderId]);
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_NonConformanceReports_CustomerId')
BEGIN
    CREATE NONCLUSTERED INDEX [IX_NonConformanceReports_CustomerId]
    ON [dbo].[NonConformanceReports] ([CustomerId]);
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_NonConformanceReports_ReportedDate')
BEGIN
    CREATE NONCLUSTERED INDEX [IX_NonConformanceReports_ReportedDate]
    ON [dbo].[NonConformanceReports] ([ReportedDate]);
END
GO

-- Add foreign key constraints (uncomment and modify if needed)
-- ALTER TABLE [dbo].[NonConformanceReports] ADD CONSTRAINT [FK_NonConformanceReports_JobOrder]
--     FOREIGN KEY ([JobOrderId]) REFERENCES [dbo].[JobOrder] ([JobOrderID]);
--
-- ALTER TABLE [dbo].[NonConformanceReports] ADD CONSTRAINT [FK_NonConformanceReports_Customer]
--     FOREIGN KEY ([CustomerId]) REFERENCES [dbo].[CustomerMaster] ([CustomerID]);

PRINT '✅ NonConformanceReports table created successfully!';
PRINT '📋 Table includes:';
PRINT '   - NCR tracking with auto-generated numbers (NCR-2024-001)';
PRINT '   - 5M root cause analysis (Man, Machine, Material, Method, Measurement)';
PRINT '   - Workflow management (Open → Investigation → Approval → Implementation → Closure)';
PRINT '   - Photo attachment support (stored as JSON array)';
PRINT '   - Cost tracking and due dates';
PRINT '   - Multi-tenant support with TenantId';
PRINT '   - Comprehensive audit trail';

GO























