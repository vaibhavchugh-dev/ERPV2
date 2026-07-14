-- =============================================
-- Delete Vendor Module Test Data
-- =============================================
-- This script deletes all vendor-related test data
-- WARNING: This will permanently delete data!
-- Make sure you have a backup if needed.
-- =============================================

USE [CimmpleDb]  -- Change to your database name if different
GO

-- =============================================
-- Delete Vendor Module Test Data
-- =============================================
-- This script deletes all vendor-related test data
-- WARNING: This will permanently delete data!
-- Make sure you have a backup if needed.
-- =============================================

-- Optional: Set your tenant ID to filter by tenant
-- If you want to delete all vendor data regardless of tenant, comment out or remove this
DECLARE @TenantId INT = NULL;  -- Set to your tenant ID, or NULL to delete all
-- Example: DECLARE @TenantId INT = 1;

PRINT '=== DELETING VENDOR MODULE TEST DATA ==='
PRINT ''

-- =============================================
-- STEP 1: Delete Vendor Order Attachments
-- =============================================
PRINT 'Step 1: Deleting VendorOrderAttachments...'

IF @TenantId IS NOT NULL
BEGIN
    DELETE voa
    FROM VendorOrderAttachments voa
    INNER JOIN VendorOrders vo ON vo.OrderID = voa.OrderID
    WHERE vo.Tenantid = @TenantId;
    
    DECLARE @AttachmentsDeleted INT = @@ROWCOUNT;
    PRINT '  Deleted ' + CAST(@AttachmentsDeleted AS NVARCHAR(10)) + ' attachment records'
END
ELSE
BEGIN
    DELETE FROM VendorOrderAttachments;
    DECLARE @AttachmentsDeletedAll INT = @@ROWCOUNT;
    PRINT '  Deleted ' + CAST(@AttachmentsDeletedAll AS NVARCHAR(10)) + ' attachment records (all tenants)'
END

-- =============================================
-- STEP 2: Delete Vendor Order Comments
-- =============================================
PRINT 'Step 2: Deleting VendorOrderComments...'

IF @TenantId IS NOT NULL
BEGIN
    DELETE voc
    FROM VendorOrderComments voc
    INNER JOIN VendorOrders vo ON vo.OrderID = voc.OrderID
    WHERE vo.Tenantid = @TenantId;
    
    DECLARE @CommentsDeleted INT = @@ROWCOUNT;
    PRINT '  Deleted ' + CAST(@CommentsDeleted AS NVARCHAR(10)) + ' comment records'
END
ELSE
BEGIN
    DELETE FROM VendorOrderComments;
    DECLARE @CommentsDeletedAll INT = @@ROWCOUNT;
    PRINT '  Deleted ' + CAST(@CommentsDeletedAll AS NVARCHAR(10)) + ' comment records (all tenants)'
END

-- =============================================
-- STEP 3: Delete Vendor Order Details
-- =============================================
PRINT 'Step 3: Deleting VendorOrderDetails...'

IF @TenantId IS NOT NULL
BEGIN
    DELETE vod
    FROM VendorOrderDetails vod
    INNER JOIN VendorOrders vo ON vo.OrderID = vod.OrderID
    WHERE vo.Tenantid = @TenantId;
    
    DECLARE @DetailsDeleted INT = @@ROWCOUNT;
    PRINT '  Deleted ' + CAST(@DetailsDeleted AS NVARCHAR(10)) + ' order detail records'
END
ELSE
BEGIN
    DELETE FROM VendorOrderDetails;
    DECLARE @DetailsDeletedAll INT = @@ROWCOUNT;
    PRINT '  Deleted ' + CAST(@DetailsDeletedAll AS NVARCHAR(10)) + ' order detail records (all tenants)'
END

-- =============================================
-- STEP 4: Delete Vendor Orders
-- =============================================
PRINT 'Step 4: Deleting VendorOrders...'

IF @TenantId IS NOT NULL
BEGIN
    DELETE FROM VendorOrders WHERE Tenantid = @TenantId;
    DECLARE @OrdersDeleted INT = @@ROWCOUNT;
    PRINT '  Deleted ' + CAST(@OrdersDeleted AS NVARCHAR(10)) + ' vendor order records'
END
ELSE
BEGIN
    DELETE FROM VendorOrders;
    DECLARE @OrdersDeletedAll INT = @@ROWCOUNT;
    PRINT '  Deleted ' + CAST(@OrdersDeletedAll AS NVARCHAR(10)) + ' vendor order records (all tenants)'
END

-- =============================================
-- STEP 5: Delete Vendor Quotation Details
-- =============================================
PRINT 'Step 5: Deleting VendorQuotationsDetails...'

IF @TenantId IS NOT NULL
BEGIN
    DELETE vqd
    FROM VendorQuotationsDetails vqd
    INNER JOIN VendorQuotations vq ON vq.OrderID = vqd.OrderID
    WHERE vq.Tenantid = @TenantId;
    
    DECLARE @QuoteDetailsDeleted INT = @@ROWCOUNT;
    PRINT '  Deleted ' + CAST(@QuoteDetailsDeleted AS NVARCHAR(10)) + ' quotation detail records'
END
ELSE
BEGIN
    DELETE FROM VendorQuotationsDetails;
    DECLARE @QuoteDetailsDeletedAll INT = @@ROWCOUNT;
    PRINT '  Deleted ' + CAST(@QuoteDetailsDeletedAll AS NVARCHAR(10)) + ' quotation detail records (all tenants)'
END

-- =============================================
-- STEP 6: Reset Vendor Quotations (set back to Draft)
-- =============================================
PRINT 'Step 6: Resetting VendorQuotations to Draft status...'

IF @TenantId IS NOT NULL
BEGIN
    UPDATE VendorQuotations
    SET Status = 'Draft',
        convertedOrderId = NULL,
        isconverted = 0
    WHERE Tenantid = @TenantId
      AND (Status = 'Converted' OR isconverted = 1 OR convertedOrderId IS NOT NULL);
    
    DECLARE @QuotesReset INT = @@ROWCOUNT;
    PRINT '  Reset ' + CAST(@QuotesReset AS NVARCHAR(10)) + ' quotations to Draft status'
END
ELSE
BEGIN
    UPDATE VendorQuotations
    SET Status = 'Draft',
        convertedOrderId = NULL,
        isconverted = 0
    WHERE Status = 'Converted' OR isconverted = 1 OR convertedOrderId IS NOT NULL;
    
    DECLARE @QuotesResetAll INT = @@ROWCOUNT;
    PRINT '  Reset ' + CAST(@QuotesResetAll AS NVARCHAR(10)) + ' quotations to Draft status (all tenants)'
END

-- =============================================
-- OPTIONAL: Delete Vendor Quotations entirely
-- =============================================
-- Uncomment the section below if you want to DELETE quotations instead of just resetting them
/*
PRINT 'Step 7: Deleting VendorQuotations...'

IF @TenantId IS NOT NULL
BEGIN
    DELETE FROM VendorQuotations WHERE Tenantid = @TenantId;
    DECLARE @QuotesDeleted INT = @@ROWCOUNT;
    PRINT '  Deleted ' + CAST(@QuotesDeleted AS NVARCHAR(10)) + ' quotation records'
END
ELSE
BEGIN
    DELETE FROM VendorQuotations;
    DECLARE @QuotesDeletedAll INT = @@ROWCOUNT;
    PRINT '  Deleted ' + CAST(@QuotesDeletedAll AS NVARCHAR(10)) + ' quotation records (all tenants)'
END
*/

-- =============================================
-- VERIFICATION: Show remaining data
-- =============================================
PRINT ''
PRINT '=== VERIFICATION ==='

IF @TenantId IS NOT NULL
BEGIN
    PRINT 'Remaining vendor data for TenantId ' + CAST(@TenantId AS NVARCHAR(10)) + ':'
    
    SELECT 'VendorOrders' AS TableName, COUNT(*) AS RecordCount
    FROM VendorOrders WHERE Tenantid = @TenantId
    UNION ALL
    SELECT 'VendorOrderDetails', COUNT(*)
    FROM VendorOrderDetails vod
    INNER JOIN VendorOrders vo ON vo.OrderID = vod.OrderID
    WHERE vo.Tenantid = @TenantId
    UNION ALL
    SELECT 'VendorQuotations', COUNT(*)
    FROM VendorQuotations WHERE Tenantid = @TenantId
    UNION ALL
    SELECT 'VendorQuotationsDetails', COUNT(*)
    FROM VendorQuotationsDetails vqd
    INNER JOIN VendorQuotations vq ON vq.OrderID = vqd.OrderID
    WHERE vq.Tenantid = @TenantId;
END
ELSE
BEGIN
    PRINT 'Remaining vendor data (all tenants):'
    
    SELECT 'VendorOrders' AS TableName, COUNT(*) AS RecordCount FROM VendorOrders
    UNION ALL
    SELECT 'VendorOrderDetails', COUNT(*) FROM VendorOrderDetails
    UNION ALL
    SELECT 'VendorQuotations', COUNT(*) FROM VendorQuotations
    UNION ALL
    SELECT 'VendorQuotationsDetails', COUNT(*) FROM VendorQuotationsDetails;
END

PRINT ''
PRINT '=== DELETION COMPLETE ==='
PRINT '✅ All vendor module test data has been deleted/reset.'
PRINT ''
PRINT 'NOTE: VendorQuotations were reset to Draft status (not deleted).'
PRINT '      If you want to delete quotations too, uncomment Step 7 in the script.'
PRINT ''
PRINT 'You can now start fresh with vendor orders and quotations!'

