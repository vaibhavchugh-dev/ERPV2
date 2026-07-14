IF OBJECT_ID(N'[__EFMigrationsHistory]') IS NULL
BEGIN
    CREATE TABLE [__EFMigrationsHistory] (
        [MigrationId] nvarchar(150) NOT NULL,
        [ProductVersion] nvarchar(32) NOT NULL,
        CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
    );
END;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [BankCOAMapping] (
        [id] int NOT NULL IDENTITY,
        [bankid] int NOT NULL,
        [accountid] int NOT NULL,
        CONSTRAINT [PK_BankCOAMapping] PRIMARY KEY ([id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [BankMaster] (
        [Id] int NOT NULL IDENTITY,
        [BankName] nvarchar(max) NOT NULL,
        [AccountNo] nvarchar(max) NOT NULL,
        [Balance] decimal(18,2) NOT NULL,
        [TenantId] int NOT NULL,
        [coa] nvarchar(max) NOT NULL,
        [locationId] int NOT NULL,
        [Phone] nvarchar(max) NOT NULL,
        [Email] nvarchar(max) NOT NULL,
        [RoutingNumber] nvarchar(max) NOT NULL,
        [AccountType] nvarchar(max) NOT NULL,
        [accountname] nvarchar(max) NOT NULL,
        [displayname] nvarchar(max) NOT NULL,
        [Bankcode] nvarchar(max) NOT NULL,
        [BankStreet1] nvarchar(max) NOT NULL,
        [BankStreet2] nvarchar(max) NOT NULL,
        [status] nvarchar(max) NOT NULL,
        [abarounting] int NULL,
        [startingcheck] int NULL,
        [checkseries] nvarchar(max) NOT NULL,
        [street] nvarchar(max) NOT NULL,
        [city] nvarchar(max) NOT NULL,
        [state] nvarchar(max) NOT NULL,
        [zip] nvarchar(max) NOT NULL,
        [lastAccountNo] nvarchar(max) NOT NULL,
        [sharingid] int NULL,
        [NickName] nvarchar(max) NOT NULL,
        [ispayrollDefault] bit NULL,
        [isprimary] bit NULL,
        CONSTRAINT [PK_BankMaster] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [Category] (
        [category_id] int NOT NULL IDENTITY,
        [category_name] nvarchar(max) NOT NULL,
        [Tenantid] int NOT NULL,
        CONSTRAINT [PK_Category] PRIMARY KEY ([category_id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [ChartofAccounts] (
        [AccountID] int NOT NULL IDENTITY,
        [AccountCode] nvarchar(max) NOT NULL,
        [AccountName] nvarchar(max) NOT NULL,
        [AccountType] nvarchar(max) NOT NULL,
        [IsActive] bit NOT NULL,
        [Groupid] int NULL,
        [Subgroupid] int NULL,
        [Subgroupid2] int NULL,
        [Subgroupid3] int NULL,
        [Linegroupid] int NULL,
        [Tenantid] int NOT NULL,
        [MainGroup] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_ChartofAccounts] PRIMARY KEY ([AccountID])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [COARowtitle] (
        [id] int NOT NULL IDENTITY,
        [SubGroupID] int NOT NULL,
        [name] nvarchar(max) NOT NULL,
        [tenantid] int NOT NULL,
        CONSTRAINT [PK_COARowtitle] PRIMARY KEY ([id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [Comments] (
        [Id] int NOT NULL IDENTITY,
        [EntryType] nvarchar(max) NOT NULL,
        [UniqueNo] nvarchar(max) NOT NULL,
        [Comments] nvarchar(max) NOT NULL,
        [TenantId] int NOT NULL,
        [CreatedBy] int NOT NULL,
        [CreatedOn] datetime2 NOT NULL,
        [CreatedFor] int NOT NULL,
        [MailSent] bit NOT NULL,
        [Readed] bit NOT NULL,
        CONSTRAINT [PK_Comments] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [CustomerBillingAddress] (
        [id] int NOT NULL IDENTITY,
        [customer_id] int NOT NULL,
        [billing_address_line1] nvarchar(max) NOT NULL,
        [billing_address_line2] nvarchar(max) NOT NULL,
        [billing_city] nvarchar(max) NOT NULL,
        [billing_state] nvarchar(max) NOT NULL,
        [billing_country] nvarchar(max) NOT NULL,
        [billing_postal_code] nvarchar(max) NOT NULL,
        [IsDefault] int NOT NULL,
        [TenantId] int NOT NULL,
        CONSTRAINT [PK_CustomerBillingAddress] PRIMARY KEY ([id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [CustomerContact] (
        [id] int NOT NULL IDENTITY,
        [customer_id] int NOT NULL,
        [title] nvarchar(max) NOT NULL,
        [firstname] nvarchar(max) NOT NULL,
        [lastname] nvarchar(max) NOT NULL,
        [phoneno] nvarchar(max) NOT NULL,
        [email] nvarchar(max) NOT NULL,
        [isDefault] bit NOT NULL,
        CONSTRAINT [PK_CustomerContact] PRIMARY KEY ([id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [CustomerMaster] (
        [customer_id] int NOT NULL IDENTITY,
        [company_name] nvarchar(max) NOT NULL,
        [companyAlias] nvarchar(max) NOT NULL,
        [firstname] nvarchar(max) NOT NULL,
        [last_name] nvarchar(max) NOT NULL,
        [email] nvarchar(max) NOT NULL,
        [address] nvarchar(max) NOT NULL,
        [apartment] nvarchar(max) NOT NULL,
        [country] nvarchar(max) NOT NULL,
        [city] nvarchar(max) NOT NULL,
        [state] nvarchar(max) NOT NULL,
        [zip] nvarchar(max) NOT NULL,
        [phone_number] nvarchar(max) NOT NULL,
        [registration_date] datetime2 NULL,
        [last_login_date] datetime2 NULL,
        [Pointofcontact] nvarchar(max) NOT NULL,
        [ContactEmail] nvarchar(max) NOT NULL,
        [WebAddress] nvarchar(max) NOT NULL,
        [Tenantid] int NOT NULL,
        [customercode] nvarchar(max) NOT NULL,
        [shippingAddress] nvarchar(max) NOT NULL,
        [shippingCity] nvarchar(max) NOT NULL,
        [shippingStates] nvarchar(max) NOT NULL,
        [shippingCountry] nvarchar(max) NOT NULL,
        [shippingZipCode] nvarchar(max) NOT NULL,
        [shippingApartment] nvarchar(max) NOT NULL,
        [status] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_CustomerMaster] PRIMARY KEY ([customer_id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [CustomerOrder] (
        [OrderID] int NOT NULL IDENTITY,
        [CustomerID] int NOT NULL,
        [customercode] nvarchar(max) NOT NULL,
        [PONumber] int NOT NULL,
        [CustomerName] nvarchar(max) NOT NULL,
        [address] nvarchar(max) NOT NULL,
        [CustomerPoNumber] nvarchar(max) NOT NULL,
        [OrderDate] datetime2 NOT NULL,
        [TotalAmount] decimal(18,2) NOT NULL,
        [UserId] int NOT NULL,
        [UserToken] int NOT NULL,
        [Status] nvarchar(max) NOT NULL,
        [locationId] int NOT NULL,
        [Tenantid] int NOT NULL,
        [quotationId] int NULL,
        [shippingInstructions] nvarchar(max) NOT NULL,
        [ExternalCustomerPO] nvarchar(max) NOT NULL,
        [QuotationNo] nvarchar(max) NOT NULL,
        [ExternalOrderDate] datetime2 NULL,
        [BuyerName] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_CustomerOrder] PRIMARY KEY ([OrderID])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [CustomerOrderDetails] (
        [ID] int NOT NULL IDENTITY,
        [OrderID] int NOT NULL,
        [ItemNo] int NOT NULL,
        [partname] nvarchar(max) NOT NULL,
        [PartNo] nvarchar(max) NOT NULL,
        [DueDate] datetime2 NOT NULL,
        [JobNumber] nvarchar(max) NOT NULL,
        [JobDesc] nvarchar(max) NOT NULL,
        [QtyOrdered] int NOT NULL,
        [Unit] nvarchar(max) NOT NULL,
        [UnitPrice] decimal(18,2) NOT NULL,
        [JobPriority] int NOT NULL,
        [Discount] decimal(18,2) NOT NULL,
        [Tenantid] int NOT NULL,
        [productid] int NULL,
        CONSTRAINT [PK_CustomerOrderDetails] PRIMARY KEY ([ID])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [CustomerShippingAddressNew] (
        [id] int NOT NULL IDENTITY,
        [customer_id] int NOT NULL,
        [shippingAddress] nvarchar(max) NOT NULL,
        [shippingCity] nvarchar(max) NOT NULL,
        [shippingStates] nvarchar(max) NOT NULL,
        [shippingCountry] nvarchar(max) NOT NULL,
        [shippingZipCode] nvarchar(max) NOT NULL,
        [shippingApartment] nvarchar(max) NOT NULL,
        [IsDefault] int NOT NULL,
        [firstname] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_CustomerShippingAddressNew] PRIMARY KEY ([id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [Deposits] (
        [DepositID] int NOT NULL IDENTITY,
        [TransactionID] int NOT NULL,
        [splitLocationid] int NULL,
        [AccountID] int NOT NULL,
        [DepositDetails] nvarchar(max) NOT NULL,
        [InternalNotes] nvarchar(max) NOT NULL,
        [Amount] decimal(18,2) NOT NULL,
        [TenantID] int NOT NULL,
        [adjustmentId] int NULL,
        [banksyncId] int NULL,
        [ReconcileCL] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_Deposits] PRIMARY KEY ([DepositID])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [DocumentMaster] (
        [Id] int NOT NULL IDENTITY,
        [DocumentName] nvarchar(max) NOT NULL,
        [DocumentType] nvarchar(max) NOT NULL,
        [TenantId] int NOT NULL,
        [CreatedBy] int NOT NULL,
        [CreatedDate] datetime2 NOT NULL,
        CONSTRAINT [PK_DocumentMaster] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [DocumentType] (
        [Id] int NOT NULL IDENTITY,
        [TypeName] nvarchar(max) NOT NULL,
        [TenantId] int NOT NULL,
        CONSTRAINT [PK_DocumentType] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [EntityMaster] (
        [entityid] int NOT NULL IDENTITY,
        [company_name] nvarchar(max) NOT NULL,
        [first_name] nvarchar(max) NOT NULL,
        [last_name] nvarchar(max) NOT NULL,
        [email] nvarchar(max) NOT NULL,
        [phone_number] nvarchar(max) NOT NULL,
        [registration_date] datetime2 NULL,
        [last_login_date] datetime2 NULL,
        [Tenantid] int NOT NULL,
        [pointofcontact] nvarchar(max) NOT NULL,
        [ContactEmail] nvarchar(max) NOT NULL,
        [WebAddress] nvarchar(max) NOT NULL,
        [address] nvarchar(max) NOT NULL,
        [apartment] nvarchar(max) NOT NULL,
        [country] nvarchar(max) NOT NULL,
        [entitycode] nvarchar(max) NOT NULL,
        [city] nvarchar(max) NOT NULL,
        [state] nvarchar(max) NOT NULL,
        [zip] nvarchar(max) NOT NULL,
        [SaleTax] decimal(18,2) NOT NULL,
        [QuotationPrefix] nvarchar(max) NOT NULL,
        [CustomerPrefix] nvarchar(max) NOT NULL,
        [VendorPrefix] nvarchar(max) NOT NULL,
        [ShippingPrefix] nvarchar(max) NOT NULL,
        [InvoicePrefix] nvarchar(max) NOT NULL,
        [timezoneui] nvarchar(max) NOT NULL,
        [timezone] nvarchar(max) NOT NULL,
        [coacount] int NOT NULL,
        CONSTRAINT [PK_EntityMaster] PRIMARY KEY ([entityid])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [Inventory] (
        [product_id] int NOT NULL IDENTITY,
        [product_name] nvarchar(max) NOT NULL,
        [category_id] int NOT NULL,
        [producttype_int] int NOT NULL,
        [quantity_in_stock] int NOT NULL,
        [price] decimal(18,2) NOT NULL,
        [sizeid] int NOT NULL,
        [inventory_description] nvarchar(max) NOT NULL,
        [status] nvarchar(max) NOT NULL,
        [Tenantid] int NOT NULL,
        CONSTRAINT [PK_Inventory] PRIMARY KEY ([product_id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [InvoiceDetail] (
        [Id] int NOT NULL IDENTITY,
        [InvoiceId] int NOT NULL,
        [OrderId] int NOT NULL,
        [ProductId] int NULL,
        [OrderDate] datetime2 NOT NULL,
        [Description] nvarchar(max) NOT NULL,
        [CustomerPoNumber] nvarchar(max) NOT NULL,
        [Amount] decimal(18,2) NOT NULL,
        [price] decimal(18,2) NOT NULL,
        [discount] decimal(18,2) NOT NULL,
        [qty] int NOT NULL,
        [ReconcileCL] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_InvoiceDetail] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [InvoiceMaster] (
        [Id] int NOT NULL IDENTITY,
        [TenantId] int NOT NULL,
        [InvoiceNo] int NOT NULL,
        [PrefixInvoiceNo] nvarchar(max) NOT NULL,
        [InvoiceDate] datetime2 NOT NULL,
        [DueDate] datetime2 NOT NULL,
        [AccountingPeriod] nvarchar(max) NOT NULL,
        [ShippingCharge] decimal(18,2) NOT NULL,
        [OtherCharge] decimal(18,2) NOT NULL,
        [SaleTax] decimal(18,2) NOT NULL,
        [SaleTaxAmount] decimal(18,2) NOT NULL,
        [Amount] decimal(18,2) NOT NULL,
        [TotalAmount] decimal(18,2) NOT NULL,
        [InternalNotes] nvarchar(max) NOT NULL,
        [CheckNo] nvarchar(max) NOT NULL,
        [PaymentMethod] nvarchar(max) NOT NULL,
        [PaymentDate] datetime2 NULL,
        [Bankid] int NULL,
        [createdby] int NULL,
        [createdDate] datetime2 NULL,
        CONSTRAINT [PK_InvoiceMaster] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [JobAttachment] (
        [Id] int NOT NULL IDENTITY,
        [jobid] int NOT NULL,
        [Name] nvarchar(max) NOT NULL,
        [size] int NOT NULL,
        [FileUniqueno] int NOT NULL,
        [UploadFile] nvarchar(max) NOT NULL,
        [TenantID] int NOT NULL,
        [FileCode] nvarchar(max) NOT NULL,
        [Pageno] nvarchar(max) NOT NULL,
        [createdby] int NOT NULL,
        CONSTRAINT [PK_JobAttachment] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [jobDetails] (
        [id] int NOT NULL IDENTITY,
        [jobid] int NOT NULL,
        [ProcessOrder] int NOT NULL,
        [processid] int NOT NULL,
        [processname] nvarchar(max) NOT NULL,
        [type] nvarchar(max) NOT NULL,
        [jdescription] nvarchar(max) NOT NULL,
        [assignedid] int NULL,
        [workstationid] int NULL,
        [qty] int NULL,
        [tenantid] int NOT NULL,
        [AssignedComment] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_jobDetails] PRIMARY KEY ([id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [jobdetailstatus] (
        [id] int NOT NULL IDENTITY,
        [jobdetailid] int NOT NULL,
        [assigntoid] int NOT NULL,
        [startdate] datetime2 NULL,
        [enddate] datetime2 NULL,
        [status] nvarchar(max) NULL,
        CONSTRAINT [PK_jobdetailstatus] PRIMARY KEY ([id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [jobMaster] (
        [jobid] int NOT NULL IDENTITY,
        [orderid] int NOT NULL,
        [jobNo] nvarchar(max) NOT NULL,
        [partid] int NOT NULL,
        [createdby] int NOT NULL,
        [tenantid] int NOT NULL,
        [jobassignedId] int NOT NULL,
        [processid] int NULL,
        [ReworkCount] int NULL,
        [TrackerStatus] nvarchar(max) NOT NULL,
        [DrawingNo] nvarchar(max) NOT NULL,
        [DrawingRevision] nvarchar(max) NOT NULL,
        [ManualTracking] bit NULL,
        CONSTRAINT [PK_jobMaster] PRIMARY KEY ([jobid])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [JobNCR] (
        [Id] int NOT NULL IDENTITY,
        [Description] nvarchar(max) NOT NULL,
        [RCA] nvarchar(max) NOT NULL,
        [PlannedAction] nvarchar(max) NOT NULL,
        [TenantId] int NOT NULL,
        [locationId] int NOT NULL,
        [JobId] int NULL,
        [TypeOfNCR] nvarchar(max) NOT NULL,
        [NCRCode] nvarchar(max) NOT NULL,
        [NCRNo] nvarchar(max) NOT NULL,
        [CreatedBy] int NULL,
        [CreatedOn] datetime2 NULL,
        [InvestigatedBy] int NULL,
        [InvestigatedOn] datetime2 NULL,
        [DispositionBy] int NULL,
        [DispositionOn] datetime2 NULL,
        [ReportedOn] datetime2 NULL,
        [vendorOrderId] int NULL,
        CONSTRAINT [PK_JobNCR] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [JobTracker] (
        [id] int NOT NULL IDENTITY,
        [jobid] int NOT NULL,
        [processid] int NOT NULL,
        [assignedid] int NOT NULL,
        [startdate] nvarchar(max) NOT NULL,
        [holdtime] nvarchar(max) NOT NULL,
        [enddatetime] nvarchar(max) NOT NULL,
        [tenantid] int NOT NULL,
        [status] nvarchar(max) NOT NULL,
        [Explanation] nvarchar(max) NOT NULL,
        [qtyComment] nvarchar(max) NOT NULL,
        [JobNCRId] int NULL,
        [completeqty] int NULL,
        [qty] int NULL,
        [NCRQty] int NULL,
        [userid] int NULL,
        [IsCreatedFromNCR] bit NULL,
        [isNCR] bit NULL,
        [jobdetailsid] int NULL,
        CONSTRAINT [PK_JobTracker] PRIMARY KEY ([id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [JournalEntries] (
        [Id] int NOT NULL IDENTITY,
        [EntryDate] datetime2 NOT NULL,
        [ReferenceNumber] nvarchar(max) NOT NULL,
        [Description] nvarchar(max) NOT NULL,
        [AccountingPeriod] nvarchar(max) NOT NULL,
        [TenantId] int NOT NULL,
        [locationId] int NOT NULL,
        [createdby] int NULL,
        [createdDate] datetime2 NULL,
        CONSTRAINT [PK_JournalEntries] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [JournalEntryFrom] (
        [Id] int NOT NULL IDENTITY,
        [JournalEntryId] int NOT NULL,
        [AccountId] int NOT NULL,
        [Amount] decimal(18,2) NOT NULL,
        [Description] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_JournalEntryFrom] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [JournalEntryTo] (
        [Id] int NOT NULL IDENTITY,
        [JournalEntryId] int NOT NULL,
        [AccountId] int NOT NULL,
        [Amount] decimal(18,2) NOT NULL,
        [Description] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_JournalEntryTo] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [Locations] (
        [LocationId] int NOT NULL IDENTITY,
        [TenantId] int NOT NULL,
        [Name] nvarchar(max) NOT NULL,
        [Code] nvarchar(max) NOT NULL,
        [Address] nvarchar(max) NOT NULL,
        [Region] nvarchar(max) NOT NULL,
        [city] nvarchar(max) NOT NULL,
        [state] nvarchar(max) NOT NULL,
        [zip] nvarchar(max) NOT NULL,
        [email] nvarchar(max) NOT NULL,
        [webaddress] nvarchar(max) NOT NULL,
        [phone] nvarchar(max) NOT NULL,
        [Country] nvarchar(max) NOT NULL,
        [LocType] int NOT NULL,
        CONSTRAINT [PK_Locations] PRIMARY KEY ([LocationId])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [LogoAttachment] (
        [Id] int NOT NULL IDENTITY,
        [locationId] int NOT NULL,
        [Name] nvarchar(max) NOT NULL,
        [size] int NOT NULL,
        [FileUniqueno] int NOT NULL,
        [UploadFile] nvarchar(max) NOT NULL,
        [TenantID] int NOT NULL,
        [FileCode] nvarchar(max) NOT NULL,
        [Pageno] nvarchar(max) NOT NULL,
        [createdby] int NOT NULL,
        CONSTRAINT [PK_LogoAttachment] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [MainGroup] (
        [Autoid] int NOT NULL IDENTITY,
        [MainGroupID] int NOT NULL,
        [MainGroupName] nvarchar(max) NOT NULL,
        [accountId] int NOT NULL,
        [tenantid] int NOT NULL,
        CONSTRAINT [PK_MainGroup] PRIMARY KEY ([Autoid])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [NCRCodeMaster] (
        [Id] int NOT NULL IDENTITY,
        [NCRCode] nvarchar(max) NOT NULL,
        [Description] nvarchar(max) NOT NULL,
        [CreatedBy] int NOT NULL,
        [TenantId] int NOT NULL,
        [CreatedDate] datetime2 NOT NULL,
        CONSTRAINT [PK_NCRCodeMaster] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [OrderAttachment] (
        [Id] int NOT NULL IDENTITY,
        [orderid] int NOT NULL,
        [Name] nvarchar(max) NOT NULL,
        [size] int NOT NULL,
        [FileUniqueno] int NOT NULL,
        [UploadFile] nvarchar(max) NOT NULL,
        [TenantID] int NOT NULL,
        [FileCode] nvarchar(max) NOT NULL,
        [Pageno] nvarchar(max) NOT NULL,
        [createdby] int NOT NULL,
        CONSTRAINT [PK_OrderAttachment] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [PartBreakupSetup] (
        [id] int NOT NULL IDENTITY,
        [priceid] int NOT NULL,
        [qty1] decimal(18,2) NULL,
        [qty2] decimal(18,2) NULL,
        [qty3] decimal(18,2) NULL,
        [qty4] decimal(18,2) NULL,
        [qty5] decimal(18,2) NULL,
        [partId] int NOT NULL,
        [tenantId] int NOT NULL,
        CONSTRAINT [PK_PartBreakupSetup] PRIMARY KEY ([id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [Payment] (
        [Id] int NOT NULL IDENTITY,
        [series] nvarchar(max) NOT NULL,
        [ckno] int NOT NULL,
        [ckdate] datetime2 NOT NULL,
        [memo] nvarchar(max) NOT NULL,
        [tenantid] int NOT NULL,
        [vid] int NOT NULL,
        [isPrint] nvarchar(max) NOT NULL,
        [createdby] int NOT NULL,
        [bankid] int NOT NULL,
        [createdate] datetime2 NOT NULL,
        [Uniqueno] int NOT NULL,
        CONSTRAINT [PK_Payment] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [PermissionMaster] (
        [PermissionId] int NOT NULL IDENTITY,
        [PermissionName] nvarchar(max) NOT NULL,
        [DisplayPermissionName] nvarchar(max) NOT NULL,
        [LevelInfo] int NOT NULL,
        [OrderNo] int NULL,
        [Url] nvarchar(max) NOT NULL,
        [ReportGroup] nvarchar(max) NOT NULL,
        [reportid] int NULL,
        [ReportDescription] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_PermissionMaster] PRIMARY KEY ([PermissionId])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [PermissionRole] (
        [Id] int NOT NULL IDENTITY,
        [RoleId] int NOT NULL,
        [PermissionId] int NOT NULL,
        [TenantId] int NOT NULL,
        CONSTRAINT [PK_PermissionRole] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [ProcessMaster] (
        [Id] int NOT NULL IDENTITY,
        [ProcessName] nvarchar(max) NOT NULL,
        [Srno] int NOT NULL,
        [PDescription] nvarchar(max) NOT NULL,
        [Tenantid] int NOT NULL,
        [isFixed] int NULL,
        [status] int NOT NULL,
        [ledgercode] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_ProcessMaster] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [ProductMaster] (
        [Id] int NOT NULL IDENTITY,
        [partno] nvarchar(max) NOT NULL,
        [partname] nvarchar(max) NOT NULL,
        [tenantid] int NOT NULL,
        [Unit] nvarchar(max) NOT NULL,
        [UnitPrice] decimal(18,2) NOT NULL,
        [Noofday] int NULL,
        [pdescription] nvarchar(max) NOT NULL,
        [customerid] int NULL,
        CONSTRAINT [PK_ProductMaster] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [ProductType] (
        [producttype_int] int NOT NULL IDENTITY,
        [producttype_name] nvarchar(max) NOT NULL,
        [Tenantid] int NOT NULL,
        CONSTRAINT [PK_ProductType] PRIMARY KEY ([producttype_int])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [QuotationOrder] (
        [OrderID] int NOT NULL IDENTITY,
        [CustomerID] int NOT NULL,
        [customercode] nvarchar(max) NOT NULL,
        [PONumber] int NOT NULL,
        [CustomerName] nvarchar(max) NOT NULL,
        [address] nvarchar(max) NOT NULL,
        [CustomerPoNumber] nvarchar(max) NOT NULL,
        [OrderDate] datetime2 NOT NULL,
        [TotalAmount] decimal(18,2) NOT NULL,
        [UserId] int NOT NULL,
        [UserToken] int NOT NULL,
        [Status] nvarchar(max) NOT NULL,
        [Tenantid] int NOT NULL,
        [shippingInstructions] nvarchar(max) NOT NULL,
        [ExternalCustomerPO] nvarchar(max) NOT NULL,
        [ExternalOrderDate] datetime2 NULL,
        [BuyerName] nvarchar(max) NOT NULL,
        [CustomerRefNo] nvarchar(max) NOT NULL,
        [isConverted] int NULL,
        [Locationid] int NULL,
        CONSTRAINT [PK_QuotationOrder] PRIMARY KEY ([OrderID])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [QuotationOrderAttachment] (
        [Id] int NOT NULL IDENTITY,
        [orderid] int NOT NULL,
        [Name] nvarchar(max) NOT NULL,
        [size] int NOT NULL,
        [FileUniqueno] int NOT NULL,
        [UploadFile] nvarchar(max) NOT NULL,
        [TenantID] int NOT NULL,
        [FileCode] nvarchar(max) NOT NULL,
        [Pageno] nvarchar(max) NOT NULL,
        [createdby] int NOT NULL,
        CONSTRAINT [PK_QuotationOrderAttachment] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [QuotationOrderDetails] (
        [ID] int NOT NULL IDENTITY,
        [OrderID] int NOT NULL,
        [ItemNo] int NOT NULL,
        [partname] nvarchar(max) NOT NULL,
        [PartNo] nvarchar(max) NOT NULL,
        [DueDate] datetime2 NOT NULL,
        [JobNumber] nvarchar(max) NOT NULL,
        [JobDesc] nvarchar(max) NOT NULL,
        [QtyOrdered] int NOT NULL,
        [Unit] nvarchar(max) NOT NULL,
        [UnitPrice] decimal(18,2) NOT NULL,
        [JobPriority] int NOT NULL,
        [Discount] decimal(18,2) NOT NULL,
        [Tenantid] int NOT NULL,
        [productid] int NULL,
        [leadTime] nvarchar(max) NOT NULL,
        [isConverted] int NULL,
        [convertedorderid] int NULL,
        [notes] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_QuotationOrderDetails] PRIMARY KEY ([ID])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [Shipping] (
        [Id] int NOT NULL IDENTITY,
        [ShipmentNo] nvarchar(max) NOT NULL,
        [ShipViaId] int NULL,
        [ShipVia] nvarchar(max) NOT NULL,
        [CourierTrackingNo] nvarchar(max) NOT NULL,
        [TotalBoxNo] int NULL,
        [PackingType] nvarchar(max) NOT NULL,
        [Terms] nvarchar(max) NOT NULL,
        [ShipmentDate] datetime2 NOT NULL,
        [TenantId] int NOT NULL,
        [OrderId] int NOT NULL,
        CONSTRAINT [PK_Shipping] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [ShippingDetails] (
        [Id] int NOT NULL IDENTITY,
        [ShippedQty] int NOT NULL,
        [JobId] int NOT NULL,
        [ShipmentId] int NOT NULL,
        CONSTRAINT [PK_ShippingDetails] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [SubGroup] (
        [Autoid] int NOT NULL IDENTITY,
        [SubGroupID] int NOT NULL,
        [MainGroupID] int NULL,
        [SubGroupName] nvarchar(max) NOT NULL,
        [tenantid] int NOT NULL,
        CONSTRAINT [PK_SubGroup] PRIMARY KEY ([Autoid])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [SubGroup2] (
        [Autoid] int NOT NULL IDENTITY,
        [SubGroup2ID] int NOT NULL,
        [SubGroupID] int NULL,
        [SubGroup2Name] nvarchar(max) NOT NULL,
        [tenantid] int NOT NULL,
        CONSTRAINT [PK_SubGroup2] PRIMARY KEY ([Autoid])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [SubGroup3] (
        [SubGroup3ID] int NOT NULL IDENTITY,
        [SubGroup2ID] int NULL,
        [SubGroup3Name] nvarchar(max) NOT NULL,
        [tenantid] int NOT NULL,
        CONSTRAINT [PK_SubGroup3] PRIMARY KEY ([SubGroup3ID])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [Transactions] (
        [TransactionID] int NOT NULL IDENTITY,
        [TransactionType] nvarchar(max) NOT NULL,
        [PaymentMethod] nvarchar(max) NOT NULL,
        [Amount] decimal(18,2) NULL,
        [TransactionDate] datetime2 NULL,
        [dueDate] datetime2 NULL,
        [invoiceDate] datetime2 NULL,
        [invoiceNo] nvarchar(max) NOT NULL,
        [AccountingPeriod] nvarchar(max) NOT NULL,
        [Description] nvarchar(max) NOT NULL,
        [CheckNo] nvarchar(max) NOT NULL,
        [TenantId] int NULL,
        [locationId] int NOT NULL,
        [BankId] int NULL,
        [vendorid] int NULL,
        [contractid] int NULL,
        [approved] bit NULL,
        [isCustomer] int NULL,
        CONSTRAINT [PK_Transactions] PRIMARY KEY ([TransactionID])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [TransCoa] (
        [Uniqueno] int NOT NULL IDENTITY,
        [Tenantid] int NOT NULL,
        [Transid] int NOT NULL,
        [accountid] int NOT NULL,
        [Transname] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_TransCoa] PRIMARY KEY ([Uniqueno])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [TransferEntries] (
        [TransferID] int NOT NULL IDENTITY,
        [TransferDate] datetime2 NULL,
        [SourceAccountID] int NOT NULL,
        [accountidfrom] int NOT NULL,
        [accountidto] int NOT NULL,
        [ReferenceNumber] nvarchar(max) NOT NULL,
        [Amount] decimal(18,2) NOT NULL,
        [Description] nvarchar(max) NOT NULL,
        [TenantID] int NOT NULL,
        [locationId] int NOT NULL,
        CONSTRAINT [PK_TransferEntries] PRIMARY KEY ([TransferID])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [UserDetails] (
        [User_UniqueID] int NOT NULL IDENTITY,
        [FirstName] nvarchar(max) NOT NULL,
        [LastName] nvarchar(max) NOT NULL,
        [Email] nvarchar(max) NOT NULL,
        [TenantID] int NOT NULL,
        [UserName] nvarchar(max) NOT NULL,
        [Password] nvarchar(max) NOT NULL,
        [Status] nvarchar(max) NOT NULL,
        [Role] int NULL,
        [PwdResetDate] datetime2 NOT NULL,
        [Phone1] nvarchar(max) NOT NULL,
        [EmployeeType] nvarchar(max) NOT NULL,
        [Date_of_hire] nvarchar(max) NOT NULL,
        [UserToken] nvarchar(max) NOT NULL,
        [PasswordSalt] nvarchar(max) NOT NULL,
        [PwdChangeStatus] nvarchar(max) NOT NULL,
        [ChangePassword] nvarchar(max) NOT NULL,
        [HID] nvarchar(max) NOT NULL,
        [PrimaryContact] nvarchar(max) NOT NULL,
        [Date_of_termination] nvarchar(max) NOT NULL,
        [Termination_Reason] nvarchar(max) NOT NULL,
        [ValidateStatus] nvarchar(max) NOT NULL,
        [DOB] nvarchar(max) NOT NULL,
        [SSN] nvarchar(max) NOT NULL,
        [ChangedBy] nvarchar(max) NOT NULL,
        [CreateDate] datetime2 NULL,
        [IsSalesAgent] int NULL,
        [AllowPTO] int NULL,
        [AllowPerformance] int NULL,
        [AllowACATracking] int NULL,
        [AllowDeposit] int NULL,
        [BlockedPhone] nvarchar(max) NOT NULL,
        [SendWelcomeEmail] int NULL,
        [PwdType] nvarchar(max) NOT NULL,
        [PhoneUpdateStatus] nvarchar(max) NOT NULL,
        [Address] nvarchar(max) NOT NULL,
        [Phone2] nvarchar(max) NOT NULL,
        [City] nvarchar(max) NOT NULL,
        [State] nvarchar(max) NOT NULL,
        [Zip] nvarchar(max) NOT NULL,
        [Street] nvarchar(max) NOT NULL,
        [PrimaryMethod] nvarchar(max) NOT NULL,
        [VendorId] int NULL,
        [ContractId] nvarchar(max) NOT NULL,
        [PaidByVendor] int NULL,
        [AllowContactorOverTime] int NULL,
        [SearchSSN] nvarchar(max) NOT NULL,
        [EmpCode] nvarchar(max) NOT NULL,
        [Empid] int NULL,
        CONSTRAINT [PK_UserDetails] PRIMARY KEY ([User_UniqueID])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [UserInfo] (
        [UserID] int NOT NULL IDENTITY,
        [User_UniqueID] int NOT NULL,
        [LogInTime] datetime2 NOT NULL,
        [LogInStatus] int NOT NULL,
        [IPAddress] nvarchar(max) NOT NULL,
        [TenantId] int NOT NULL,
        CONSTRAINT [PK_UserInfo] PRIMARY KEY ([UserID])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [UserLogin] (
        [id] int NOT NULL IDENTITY,
        [username] nvarchar(max) NOT NULL,
        [logintime] datetime2 NOT NULL,
        [ipaddress] int NOT NULL,
        [browser] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_UserLogin] PRIMARY KEY ([id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [UserMapping] (
        [Id] int NOT NULL IDENTITY,
        [userId] int NOT NULL,
        [locationId] int NOT NULL,
        CONSTRAINT [PK_UserMapping] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [UserRole] (
        [RoleID] int NOT NULL IDENTITY,
        [RoleName] nvarchar(max) NOT NULL,
        [OrderNo] int NOT NULL,
        [ResetPwd] nvarchar(max) NOT NULL,
        [TenantId] int NOT NULL,
        [RoleTag] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_UserRole] PRIMARY KEY ([RoleID])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [UserWorkstationMapping] (
        [Id] int NOT NULL IDENTITY,
        [WorkstationId] int NOT NULL,
        [UserId] int NOT NULL,
        [TenantId] int NOT NULL,
        CONSTRAINT [PK_UserWorkstationMapping] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [VendorBillingAddress] (
        [id] int NOT NULL IDENTITY,
        [customer_id] int NOT NULL,
        [billing_address_line1] nvarchar(max) NOT NULL,
        [billing_address_line2] nvarchar(max) NOT NULL,
        [billing_city] nvarchar(max) NOT NULL,
        [billing_state] nvarchar(max) NOT NULL,
        [billing_country] nvarchar(max) NOT NULL,
        [billing_postal_code] nvarchar(max) NOT NULL,
        [IsDefault] int NOT NULL,
        [TenantId] int NOT NULL,
        CONSTRAINT [PK_VendorBillingAddress] PRIMARY KEY ([id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [VendorCOAMapping] (
        [id] int NOT NULL IDENTITY,
        [vendorid] int NOT NULL,
        [accountid] int NOT NULL,
        CONSTRAINT [PK_VendorCOAMapping] PRIMARY KEY ([id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [VendorContact] (
        [id] int NOT NULL IDENTITY,
        [customer_id] int NOT NULL,
        [title] nvarchar(max) NOT NULL,
        [firstname] nvarchar(max) NOT NULL,
        [lastname] nvarchar(max) NOT NULL,
        [phoneno] nvarchar(max) NOT NULL,
        [email] nvarchar(max) NOT NULL,
        [isDefault] bit NOT NULL,
        CONSTRAINT [PK_VendorContact] PRIMARY KEY ([id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [VendorInvoiceDetail] (
        [Id] int NOT NULL IDENTITY,
        [InvoiceId] int NOT NULL,
        [accountid] int NULL,
        [vdetailid] int NULL,
        [OrderId] int NOT NULL,
        [splitLocationid] int NULL,
        [OrderDate] datetime2 NULL,
        [Description] nvarchar(max) NOT NULL,
        [VendorPoNumber] nvarchar(max) NOT NULL,
        [Amount] decimal(18,2) NOT NULL,
        [ReconcileCL] nvarchar(max) NOT NULL,
        [adjustmentId] int NULL,
        [banksyncId] int NULL,
        [qty] int NULL,
        [price] decimal(18,2) NULL,
        [qtyordered] int NULL,
        CONSTRAINT [PK_VendorInvoiceDetail] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [VendorInvoiceMaster] (
        [Id] int NOT NULL IDENTITY,
        [TenantId] int NOT NULL,
        [locationId] int NOT NULL,
        [InvoiceNo] nvarchar(max) NOT NULL,
        [PaymentMethod] nvarchar(max) NOT NULL,
        [InvoiceDate] datetime2 NOT NULL,
        [DueDate] datetime2 NOT NULL,
        [VendorCode] nvarchar(max) NOT NULL,
        [VendorName] nvarchar(max) NOT NULL,
        [AccountingPeriod] nvarchar(max) NOT NULL,
        [Amount] decimal(18,2) NOT NULL,
        [TotalAmount] decimal(18,2) NOT NULL,
        [Approved] bit NULL,
        [CkNo] nvarchar(max) NOT NULL,
        [CkDate] datetime2 NULL,
        [PvrNo] int NULL,
        [Series] nvarchar(max) NOT NULL,
        [iscustomer] bit NULL,
        [entrytype] nvarchar(max) NOT NULL,
        [vid] int NOT NULL,
        [Adj] nvarchar(max) NOT NULL,
        [isPaid] int NULL,
        [Paydate] datetime2 NULL,
        [Bankid] int NULL,
        [createdby] int NULL,
        [voidedby] int NULL,
        [entrydate] datetime2 NULL,
        [voideddate] datetime2 NULL,
        [prefixinvoiceno] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_VendorInvoiceMaster] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [VendorMaster] (
        [vendor_id] int NOT NULL IDENTITY,
        [company_name] nvarchar(max) NOT NULL,
        [companyAlias] nvarchar(max) NOT NULL,
        [firstname] nvarchar(max) NOT NULL,
        [last_name] nvarchar(max) NOT NULL,
        [email] nvarchar(max) NOT NULL,
        [status] nvarchar(max) NOT NULL,
        [address] nvarchar(max) NOT NULL,
        [apartment] nvarchar(max) NOT NULL,
        [country] nvarchar(max) NOT NULL,
        [phone_number] nvarchar(max) NOT NULL,
        [registration_date] datetime2 NULL,
        [last_login_date] datetime2 NULL,
        [Pointofcontact] nvarchar(max) NOT NULL,
        [ContactEmail] nvarchar(max) NOT NULL,
        [WebAddress] nvarchar(max) NOT NULL,
        [Tenantid] int NOT NULL,
        [ship_via] nvarchar(max) NOT NULL,
        [term] nvarchar(max) NOT NULL,
        [purchasing_agent] nvarchar(max) NOT NULL,
        [city] nvarchar(max) NOT NULL,
        [state] nvarchar(max) NOT NULL,
        [zip] nvarchar(max) NOT NULL,
        [vendorcode] nvarchar(max) NOT NULL,
        [shippingAddress] nvarchar(max) NOT NULL,
        [shippingCity] nvarchar(max) NOT NULL,
        [shippingStates] nvarchar(max) NOT NULL,
        [shippingCountry] nvarchar(max) NOT NULL,
        [shippingZipCode] nvarchar(max) NOT NULL,
        [shippingApartment] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_VendorMaster] PRIMARY KEY ([vendor_id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [VendorOrder] (
        [OrderID] int NOT NULL IDENTITY,
        [VendorID] int NOT NULL,
        [ship_via] nvarchar(max) NOT NULL,
        [refNo] nvarchar(max) NOT NULL,
        [vendorcode] nvarchar(max) NOT NULL,
        [PONumber] int NOT NULL,
        [VendorName] nvarchar(max) NOT NULL,
        [address] nvarchar(max) NOT NULL,
        [VendorPoNumber] nvarchar(max) NOT NULL,
        [OrderDate] datetime2 NOT NULL,
        [DueDate] datetime2 NOT NULL,
        [sentDate] datetime2 NULL,
        [cancelDate] datetime2 NULL,
        [TotalAmount] decimal(18,2) NOT NULL,
        [UserId] int NOT NULL,
        [UserToken] int NOT NULL,
        [Status] nvarchar(max) NOT NULL,
        [Tenantid] int NOT NULL,
        [locationId] int NOT NULL,
        [shippingInstructions] nvarchar(max) NOT NULL,
        [contactName] nvarchar(max) NOT NULL,
        [VendorOrderType] nvarchar(max) NOT NULL,
        [POInitiated] bit NULL,
        CONSTRAINT [PK_VendorOrder] PRIMARY KEY ([OrderID])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [VendorOrderDetails] (
        [ID] int NOT NULL IDENTITY,
        [JobId] int NOT NULL,
        [OrderID] int NOT NULL,
        [ItemNo] int NOT NULL,
        [itemname] nvarchar(max) NOT NULL,
        [glcode] nvarchar(max) NOT NULL,
        [DueDate] datetime2 NOT NULL,
        [JobNumber] nvarchar(max) NOT NULL,
        [JobDesc] nvarchar(max) NOT NULL,
        [QtyOrdered] int NOT NULL,
        [Unit] nvarchar(max) NOT NULL,
        [UnitPrice] decimal(18,2) NOT NULL,
        [JobPriority] int NOT NULL,
        [Discount] decimal(18,2) NOT NULL,
        [Tenantid] int NOT NULL,
        [Received] nvarchar(max) NOT NULL,
        [productid] int NULL,
        [partid] int NULL,
        [ReceivedQty] int NULL,
        [IsAdditionItem] bit NULL,
        [Groupid] int NULL,
        [jobdetailId] int NULL,
        CONSTRAINT [PK_VendorOrderDetails] PRIMARY KEY ([ID])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [VendorQuotations] (
        [OrderID] int NOT NULL IDENTITY,
        [VendorID] int NOT NULL,
        [ship_via] nvarchar(max) NOT NULL,
        [vendorcode] nvarchar(max) NOT NULL,
        [PONumber] int NOT NULL,
        [VendorName] nvarchar(max) NOT NULL,
        [address] nvarchar(max) NOT NULL,
        [VendorPoNumber] nvarchar(max) NOT NULL,
        [OrderDate] datetime2 NOT NULL,
        [DueDate] datetime2 NOT NULL,
        [TotalAmount] decimal(18,2) NOT NULL,
        [UserId] int NOT NULL,
        [UserToken] int NOT NULL,
        [Status] nvarchar(max) NOT NULL,
        [Tenantid] int NOT NULL,
        [shippingInstructions] nvarchar(max) NOT NULL,
        [contactName] nvarchar(max) NOT NULL,
        [VendorOrderType] nvarchar(max) NOT NULL,
        [POInitiated] bit NULL,
        [isSent] bit NOT NULL,
        [sentDate] datetime2 NULL,
        [isconverted] int NULL,
        [locationid] int NULL,
        CONSTRAINT [PK_VendorQuotations] PRIMARY KEY ([OrderID])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [VendorQuotationsDetails] (
        [ID] int NOT NULL IDENTITY,
        [JobId] int NOT NULL,
        [OrderID] int NOT NULL,
        [ItemNo] int NOT NULL,
        [itemname] nvarchar(max) NOT NULL,
        [glcode] nvarchar(max) NOT NULL,
        [DueDate] datetime2 NOT NULL,
        [JobNumber] nvarchar(max) NOT NULL,
        [JobDesc] nvarchar(max) NOT NULL,
        [QtyOrdered] int NOT NULL,
        [Unit] nvarchar(max) NOT NULL,
        [UnitPrice] decimal(18,2) NOT NULL,
        [JobPriority] int NOT NULL,
        [Discount] decimal(18,2) NOT NULL,
        [Tenantid] int NOT NULL,
        [Received] nvarchar(max) NOT NULL,
        [productid] int NULL,
        [ReceivedQty] int NULL,
        [IsAdditionItem] bit NULL,
        [Groupid] int NULL,
        [jobdetailId] int NULL,
        CONSTRAINT [PK_VendorQuotationsDetails] PRIMARY KEY ([ID])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [VendorRFQDetails] (
        [id] int NOT NULL IDENTITY,
        [RFQID] int NOT NULL,
        [vid] int NULL,
        [vgroupid] int NULL,
        CONSTRAINT [PK_VendorRFQDetails] PRIMARY KEY ([id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [VendorRFQitems] (
        [id] int NOT NULL IDENTITY,
        [rfqdetailid] int NULL,
        [qty] int NULL,
        [itemid] int NULL,
        [price] decimal(18,2) NULL,
        [notes] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_VendorRFQitems] PRIMARY KEY ([id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [VendorRFQMaster] (
        [id] int NOT NULL IDENTITY,
        [orderid] int NOT NULL,
        [StartDate] datetime2 NULL,
        [enddate] datetime2 NULL,
        [status] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_VendorRFQMaster] PRIMARY KEY ([id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [VendorShippingAddress] (
        [id] int NOT NULL IDENTITY,
        [customer_id] int NOT NULL,
        [shippingAddress] nvarchar(max) NOT NULL,
        [shippingCity] nvarchar(max) NOT NULL,
        [shippingStates] nvarchar(max) NOT NULL,
        [shippingCountry] nvarchar(max) NOT NULL,
        [shippingZipCode] nvarchar(max) NOT NULL,
        [shippingApartment] nvarchar(max) NOT NULL,
        [IsDefault] int NOT NULL,
        [firstname] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_VendorShippingAddress] PRIMARY KEY ([id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [Withdrawals] (
        [WithdrawalID] int NOT NULL IDENTITY,
        [TransactionID] int NOT NULL,
        [splitLocationid] int NULL,
        [AccountID] int NOT NULL,
        [WithdrawalDetails] nvarchar(max) NOT NULL,
        [InternalNotes] nvarchar(max) NOT NULL,
        [Amount] decimal(18,2) NOT NULL,
        [TenantID] int NOT NULL,
        [adjustmentId] int NULL,
        [banksyncId] int NULL,
        [ReconcileCL] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_Withdrawals] PRIMARY KEY ([WithdrawalID])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    CREATE TABLE [WorkstationMaster] (
        [Id] int NOT NULL IDENTITY,
        [WorkstationName] nvarchar(max) NOT NULL,
        [TenantId] int NOT NULL,
        [IsActive] bit NOT NULL,
        CONSTRAINT [PK_WorkstationMaster] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251223153944_InitialCreate')
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20251223153944_InitialCreate', N'7.0.0');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251226082346_AddPriceBreakdownMaster')
BEGIN

                    IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[VendorBillingAddress]') AND type in (N'U'))
                        DROP TABLE [dbo].[VendorBillingAddress];
                    
                    IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[VendorShippingAddress]') AND type in (N'U'))
                        DROP TABLE [dbo].[VendorShippingAddress];
                
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251226082346_AddPriceBreakdownMaster')
BEGIN

                    IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[VendorMaster]') AND name = 'Pointofcontact')
                        ALTER TABLE [dbo].[VendorMaster] DROP COLUMN [Pointofcontact];
                    
                    IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[VendorMaster]') AND name = 'purchasing_agent')
                        ALTER TABLE [dbo].[VendorMaster] DROP COLUMN [purchasing_agent];
                
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251226082346_AddPriceBreakdownMaster')
BEGIN
    DECLARE @var0 sysname;
    SELECT @var0 = [d].[name]
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[BankMaster]') AND [c].[name] = N'country');
    IF @var0 IS NOT NULL EXEC(N'ALTER TABLE [BankMaster] DROP CONSTRAINT [' + @var0 + '];');
    UPDATE [BankMaster] SET [country] = N'' WHERE [country] IS NULL;
    ALTER TABLE [BankMaster] ALTER COLUMN [country] nvarchar(max) NOT NULL;
    ALTER TABLE [BankMaster] ADD DEFAULT N'' FOR [country];
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251226082346_AddPriceBreakdownMaster')
BEGIN
    DECLARE @var1 sysname;
    SELECT @var1 = [d].[name]
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[BankMaster]') AND [c].[name] = N'apartment');
    IF @var1 IS NOT NULL EXEC(N'ALTER TABLE [BankMaster] DROP CONSTRAINT [' + @var1 + '];');
    UPDATE [BankMaster] SET [apartment] = N'' WHERE [apartment] IS NULL;
    ALTER TABLE [BankMaster] ALTER COLUMN [apartment] nvarchar(max) NOT NULL;
    ALTER TABLE [BankMaster] ADD DEFAULT N'' FOR [apartment];
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251226082346_AddPriceBreakdownMaster')
BEGIN

                    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[PriceBreakdownMaster]') AND type in (N'U'))
                    BEGIN
                        CREATE TABLE [dbo].[PriceBreakdownMaster] (
                            [Id] int NOT NULL IDENTITY(1,1),
                            [ItemName] nvarchar(max) NOT NULL,
                            [Srno] int NOT NULL,
                            [Status] int NOT NULL,
                            [Tenantid] int NOT NULL,
                            CONSTRAINT [PK_PriceBreakdownMaster] PRIMARY KEY ([Id])
                        );
                    END
                
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251226082346_AddPriceBreakdownMaster')
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20251226082346_AddPriceBreakdownMaster', N'7.0.0');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251228133802_AddConvertedOrder')
BEGIN
    ALTER TABLE [QuotationOrderDetails] ADD [QuantityTiers] nvarchar(max) NULL;
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251228133802_AddConvertedOrder')
BEGIN
    ALTER TABLE [QuotationOrder] ADD [AttachmentsJson] nvarchar(max) NULL;
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251228133802_AddConvertedOrder')
BEGIN
    ALTER TABLE [QuotationOrder] ADD [CommentsJson] nvarchar(max) NULL;
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251228133802_AddConvertedOrder')
BEGIN
    ALTER TABLE [QuotationOrder] ADD [convertedOrderId] int NULL;
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251228133802_AddConvertedOrder')
BEGIN
    ALTER TABLE [CustomerOrderDetails] ADD [leadTime] nvarchar(max) NOT NULL DEFAULT N'';
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251228133802_AddConvertedOrder')
BEGIN
    ALTER TABLE [CustomerOrderDetails] ADD [notes] nvarchar(max) NOT NULL DEFAULT N'';
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251228133802_AddConvertedOrder')
BEGIN
    ALTER TABLE [CustomerOrder] ADD [AttachmentsJson] nvarchar(max) NULL;
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251228133802_AddConvertedOrder')
BEGIN
    ALTER TABLE [CustomerOrder] ADD [CommentsJson] nvarchar(max) NULL;
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251228133802_AddConvertedOrder')
BEGIN
    CREATE TABLE [CreditCardMaster] (
        [Id] int NOT NULL IDENTITY,
        [CardNumber] nvarchar(max) NOT NULL,
        [LastFourDigits] nvarchar(max) NOT NULL,
        [CardholderName] nvarchar(max) NOT NULL,
        [CardType] nvarchar(max) NOT NULL,
        [ExpiryMonth] nvarchar(max) NOT NULL,
        [ExpiryYear] nvarchar(max) NOT NULL,
        [CVV] nvarchar(max) NOT NULL,
        [BillingStreet] nvarchar(max) NOT NULL,
        [BillingApartment] nvarchar(max) NOT NULL,
        [BillingCity] nvarchar(max) NOT NULL,
        [BillingState] nvarchar(max) NOT NULL,
        [BillingZip] nvarchar(max) NOT NULL,
        [BillingCountry] nvarchar(max) NOT NULL,
        [Phone] nvarchar(max) NOT NULL,
        [Email] nvarchar(max) NOT NULL,
        [Status] int NOT NULL,
        [TenantId] int NOT NULL,
        [NickName] nvarchar(max) NOT NULL,
        [IsPrimary] bit NULL,
        [COA] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_CreditCardMaster] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251228133802_AddConvertedOrder')
BEGIN
    CREATE TABLE [PriceBreakdownMaster] (
        [Id] int NOT NULL IDENTITY,
        [ItemName] nvarchar(max) NOT NULL,
        [Srno] int NOT NULL,
        [Status] int NOT NULL,
        [Tenantid] int NOT NULL,
        CONSTRAINT [PK_PriceBreakdownMaster] PRIMARY KEY ([Id])
    );
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251228133802_AddConvertedOrder')
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20251228133802_AddConvertedOrder', N'7.0.0');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251229051236_AddDrawingFieldsToJobOrderMaster')
BEGIN
    ALTER TABLE [JobOrderMaster] ADD [DrawingNumber] nvarchar(max) NULL;
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251229051236_AddDrawingFieldsToJobOrderMaster')
BEGIN
    ALTER TABLE [JobOrderMaster] ADD [DrawingRevision] nvarchar(max) NULL;
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20251229051236_AddDrawingFieldsToJobOrderMaster')
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20251229051236_AddDrawingFieldsToJobOrderMaster', N'7.0.0');
END;
GO

COMMIT;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20260105100805_AddConvertedOrderIdToVendorQuotations')
BEGIN
    ALTER TABLE [VendorQuotations] ADD [convertedOrderId] int NULL;
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20260105100805_AddConvertedOrderIdToVendorQuotations')
BEGIN
    ALTER TABLE [ShippingDetails] ADD [OrderDetailID] int NULL;
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20260105100805_AddConvertedOrderIdToVendorQuotations')
BEGIN
    ALTER TABLE [InvoiceDetail] ADD [OrderDetailID] int NULL;
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20260105100805_AddConvertedOrderIdToVendorQuotations')
BEGIN
    ALTER TABLE [InvoiceDetail] ADD [QtyInvoiced] int NOT NULL DEFAULT 0;
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20260105100805_AddConvertedOrderIdToVendorQuotations')
BEGIN
    ALTER TABLE [CustomerOrderDetails] ADD [InvoiceStatus] nvarchar(max) NOT NULL DEFAULT N'';
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20260105100805_AddConvertedOrderIdToVendorQuotations')
BEGIN
    ALTER TABLE [CustomerOrderDetails] ADD [InvoicedQty] int NOT NULL DEFAULT 0;
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20260105100805_AddConvertedOrderIdToVendorQuotations')
BEGIN
    ALTER TABLE [CustomerOrderDetails] ADD [ShippedQty] int NOT NULL DEFAULT 0;
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20260105100805_AddConvertedOrderIdToVendorQuotations')
BEGIN
    ALTER TABLE [CustomerOrderDetails] ADD [ShippingStatus] nvarchar(max) NOT NULL DEFAULT N'';
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20260105100805_AddConvertedOrderIdToVendorQuotations')
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260105100805_AddConvertedOrderIdToVendorQuotations', N'7.0.0');
END;
GO

COMMIT;
GO

