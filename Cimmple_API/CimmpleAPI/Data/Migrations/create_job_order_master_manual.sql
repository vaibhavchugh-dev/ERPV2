-- Create JobOrderMaster table
-- This script is safe to run multiple times (checks if table exists first)

IF NOT EXISTS (
    SELECT 1 
    FROM sys.tables 
    WHERE name = 'JobOrderMaster'
)
BEGIN
    CREATE TABLE JobOrderMaster (
        JobOrderID int NOT NULL IDENTITY(1,1) PRIMARY KEY,
        JobOrderNumber int NOT NULL,
        CustomerOrderID int NOT NULL,
        CustomerOrderDetailID int NOT NULL,
        CustomerID int NOT NULL,
        CustomerName nvarchar(max) NOT NULL,
        CustomerCode nvarchar(max) NOT NULL,
        JobNumber nvarchar(max) NOT NULL,
        JobDesc nvarchar(max) NOT NULL,
        PartNo nvarchar(max) NOT NULL,
        PartName nvarchar(max) NOT NULL,
        QtyOrdered int NOT NULL,
        Unit nvarchar(max) NOT NULL,
        UnitPrice decimal(18,2) NOT NULL,
        DueDate datetime2 NOT NULL,
        JobPriority int NOT NULL,
        Status nvarchar(max) NOT NULL,
        Tenantid int NOT NULL,
        UserId int NOT NULL,
        UserToken int NOT NULL,
        OrderDate datetime2 NOT NULL,
        AttachmentsJson nvarchar(max) NULL,
        CommentsJson nvarchar(max) NULL,
        CreatedDate datetime2 NOT NULL DEFAULT GETDATE(),
        ModifiedDate datetime2 NULL
    );
    
    PRINT 'Table JobOrderMaster created successfully.';
END
ELSE
BEGIN
    PRINT 'Table JobOrderMaster already exists.';
END
GO


