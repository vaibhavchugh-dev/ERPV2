# Vendor Order Database Update Guide

## Overview
This guide documents the comprehensive database update script that adds all required columns to support the Vendor Order module, including proper data migration and verification.

## What This Script Does

### 1. **Column Additions to VendorOrders Table**
- ✅ `MaterialType` (NVARCHAR(50)) - For Material/Service classification
- ✅ `QuotationId` (INT) - Links to original quotation when converted
- ✅ `QuotationNo` (NVARCHAR(50)) - Quotation number reference

### 2. **Column Additions to VendorOrderDetails Table**
- ✅ `PartName` (NVARCHAR(500)) - Part/item name
- ✅ `PartNo` (NVARCHAR(200)) - Part number
- ✅ `DueDateString` (NVARCHAR(50)) - String-based date storage
- ✅ `LeadTime` (NVARCHAR(100)) - Lead time information
- ✅ `Notes` (NVARCHAR(MAX)) - Additional notes
- ✅ `ShippedQty` (INT, default 0) - Quantity shipped
- ✅ `ShippingStatus` (NVARCHAR(50)) - Shipping status
- ✅ `InvoicedQty` (INT, default 0) - Quantity invoiced
- ✅ `InvoiceStatus` (NVARCHAR(50)) - Invoice status

### 3. **Data Migration**
- ✅ Migrates `itemname` → `PartName` (preserves existing data)
- ✅ Converts `DueDate` (DateTime) → `DueDateString` (string) in ISO format
- ✅ Sets default values for new columns:
  - `ShippedQty` = 0
  - `InvoicedQty` = 0
  - `ShippingStatus` = "Not Started"
  - `InvoiceStatus` = "Not Invoiced"

### 4. **Table Creation**
- ✅ `VendorOrderAttachments` - For file attachments
- ✅ `VendorOrderComments` - For order comments

### 5. **Indexes**
- ✅ `IX_VendorOrders_VendorID` - Performance index
- ✅ `IX_VendorOrders_QuotationId` - For quotation tracking

### 6. **Verification**
- ✅ Lists all columns in VendorOrderDetails
- ✅ Verifies all required columns exist
- ✅ Shows data statistics and migration results
- ✅ Displays sample data

## Column Mapping

### Model to Database Mapping

| Model Property | Database Column | Notes |
|---------------|----------------|-------|
| `PartName` | `PartName` | New column, data migrated from `itemname` |
| `PartNo` | `PartNo` | New column |
| `DueDate` | `DueDateString` | New column, converted from `DueDate` DateTime |
| `ProductId` | `productid` | Existing column (case handled) |
| `LeadTime` | `LeadTime` | New column |
| `Notes` | `Notes` | New column |
| `ShippedQty` | `ShippedQty` | New column |
| `ShippingStatus` | `ShippingStatus` | New column |
| `InvoicedQty` | `InvoicedQty` | New column |
| `InvoiceStatus` | `InvoiceStatus` | New column |

### Preserved Columns
- `itemname` - Kept for backward compatibility
- `DueDate` (DateTime) - Kept for backward compatibility
- `productid` - Kept, mapped to `ProductId` in model
- All other existing columns remain unchanged

## Execution Steps

### 1. **Run the SQL Script**
```sql
-- Execute vendor_order_tables_check.sql in SQL Server Management Studio
-- Make sure you're connected to the CimmpleDb database
```

### 2. **Verify Execution**
The script will output:
- ✅ Column addition confirmations
- ✅ Data migration statistics
- ✅ Column structure verification
- ✅ Data statistics

### 3. **Update Model (Already Done)**
The `VendorOrderDetail.cs` model has been updated with:
- `[Column]` attributes for proper mapping
- `DueDateString` column mapping
- `productid` column mapping

### 4. **Update DbContext (Already Done)**
The `CimmpleDbContext.cs` has been configured with:
- Proper column mappings
- Nullable configurations
- Foreign key relationships

### 5. **Restart API**
Restart your ASP.NET Core API to pick up the changes.

### 6. **Test**
- Create a new vendor order
- Convert a vendor quotation to order
- Verify all fields save correctly

## Troubleshooting

### If columns already exist:
- The script checks for existence before adding
- Safe to run multiple times
- Will only add missing columns

### If migration fails:
- Check SQL Server error messages
- Verify database permissions
- Ensure VendorOrderDetails table exists

### If data doesn't appear:
- Check the verification queries in the script
- Verify column mappings in the model
- Check API logs for errors

## Key Features

✅ **Idempotent** - Safe to run multiple times  
✅ **Data Preservation** - Existing data is migrated, not lost  
✅ **Backward Compatible** - Old columns preserved  
✅ **Comprehensive Verification** - Detailed checks and reports  
✅ **Error Handling** - Graceful handling of missing tables/columns  
✅ **Performance** - Indexes added for better query performance  

## Next Steps After Running Script

1. ✅ Verify all columns were added (check script output)
2. ✅ Verify data migration completed (check statistics)
3. ✅ Restart ASP.NET Core API
4. ✅ Test vendor order creation
5. ✅ Test quotation to order conversion
6. ✅ Verify all fields save and load correctly

## Support

If you encounter any issues:
1. Check the script output for error messages
2. Verify the verification queries show all columns exist
3. Check API logs for any mapping errors
4. Ensure the model and DbContext match the database schema

---

**Script Version:** 2.0 (Comprehensive Update)  
**Last Updated:** 2026-01-08  
**Compatible With:** Cimmple ERP Vendor Order Module


































