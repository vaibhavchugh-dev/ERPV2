# Customer vs Vendor Module Separation

This document outlines the clear separation between Customer and Vendor modules in the Cimmple ERP system.

## 📋 **Module Structure**

### **Customer Modules**
- **Quotations**: `QuotationOrder` table → `QuotationController.GetQuotations()`, `GetQuotationById()`, `SaveQuotation()`
- **Orders**: `CustomerOrder` table → `OrderController.GetOrders()`, `GetOrderById()`, `SaveOrder()`
- **Details**: `QuotationOrderDetails` and `CustomerOrderDetails` tables
- **Prefix**: Customer Quotations use `CQ#`, Customer Orders use `CO#`

### **Vendor Modules**
- **Quotations**: `VendorQuotations` table → `QuotationController.GetVendorQuotations()`, `GetVendorQuotationById()`, `SaveVendorQuotation()`
- **Orders**: `VendorOrders` table → `OrderController.GetVendorOrders()`, `GetVendorOrderById()`, `SaveVendorOrder()`
- **Details**: `VendorQuotationsDetails` and `VendorOrderDetails` tables
- **Prefix**: Vendor Quotations use `VQ#`, Vendor Orders use `VO#`

## 🔌 **API Endpoints**

### **Customer Quotations**
- `GET /api/Quotation/GetQuotations?tenantid={id}`
- `GET /api/Quotation/GetQuotationById?quotationId={id}&tenantId={id}`
- `POST /api/Quotation/SaveQuotation`
- `DELETE /api/Quotation/DeleteQuotation?quotationId={id}&tenantId={id}`

### **Vendor Quotations**
- `GET /api/Quotation/GetVendorQuotations?tenantid={id}`
- `GET /api/Quotation/GetVendorQuotationById?quotationId={id}&tenantId={id}`
- `POST /api/Quotation/SaveVendorQuotation`
- `DELETE /api/Quotation/DeleteVendorQuotation?quotationId={id}&tenantId={id}`

### **Customer Orders**
- `GET /api/Order/GetOrders?tenantid={id}`
- `GET /api/Order/GetOrderById?orderId={id}&tenantId={id}`
- `POST /api/Order/SaveOrder`
- `DELETE /api/Order/DeleteOrder?orderId={id}&tenantId={id}`

### **Vendor Orders**
- `GET /api/Order/GetVendorOrders?tenantId={id}`
- `GET /api/Order/GetVendorOrderById?orderId={id}&tenantId={id}`
- `POST /api/Order/SaveVendorOrder`
- `DELETE /api/Order/DeleteVendorOrder?orderId={id}&tenantId={id}`

## 🗄️ **Database Tables**

### **Customer Tables**
- `QuotationOrder` - Customer quotation master records
- `QuotationOrderDetails` - Customer quotation line items
- `CustomerOrder` - Customer order master records
- `CustomerOrderDetails` - Customer order line items

### **Vendor Tables**
- `VendorQuotations` - Vendor quotation master records
- `VendorQuotationsDetails` - Vendor quotation line items
- `VendorOrders` - Vendor order master records
- `VendorOrderDetails` - Vendor order line items
- `VendorOrderAttachments` - Vendor order attachments
- `VendorOrderComments` - Vendor order comments

## 📊 **Entity Models**

### **Customer Models**
- `QuotationOrder` (in `CimmpleAPI.Data.Models`)
- `QuotationOrderDetails` (in `CimmpleAPI.Data.Models`)
- `CustomerOrder` (in `CimmpleAPI.Data.Models`)
- `CustomerOrderDetails` (in `CimmpleAPI.Data.Models`)

### **Vendor Models**
- `VendorQuotations` (in `CimmpleAPI.Data.Models`)
- `VendorQuotationsDetails` (in `CimmpleAPI.Data.Models`)
- `VendorOrder` (in `CimmpleAPI.Data.Models`)
- `VendorOrderDetail` (in `CimmpleAPI.Data.Models`)
- `VendorOrderAttachment` (in `CimmpleAPI.Data.Models`)
- `VendorOrderComment` (in `CimmpleAPI.Data.Models`)

## 🔧 **DbContext Configuration**

### **Customer DbSets**
```csharp
public DbSet<QuotationOrder> QuotationOrder { get; set; }
public DbSet<QuotationOrderDetails> QuotationOrderDetails { get; set; }
public DbSet<CustomerOrder> CustomerOrder { get; set; }
public DbSet<CustomerOrderDetails> CustomerOrderDetails { get; set; }
```

### **Vendor DbSets**
```csharp
public DbSet<VendorQuotations> VendorQuotations { get; set; }
public DbSet<VendorQuotationsDetails> VendorQuotationsDetails { get; set; }
public DbSet<VendorOrder> VendorOrders { get; set; }
public DbSet<VendorOrderDetail> VendorOrderDetails { get; set; }
public DbSet<VendorOrderAttachment> VendorOrderAttachments { get; set; }
public DbSet<VendorOrderComment> VendorOrderComments { get; set; }
```

## 🎯 **Key Differences**

1. **Field Names**: Customer modules use `CustomerID`, `CustomerName`, `CustomerCode`, while Vendor modules use `VendorID`, `VendorName`, `VendorCode`
2. **Order Type**: Vendor orders have `OrderType = "Vendor"` and `MaterialType` field
3. **Status Workflow**: 
   - Customer Orders: Draft, Sent, Receiving, Completed, Cancelled
   - Vendor Orders: Draft, Sent, Receiving, Completed, Cancelled
4. **Navigation**: Customer modules are under "Sales" menu, Vendor modules are under "Purchasing" menu

## ✅ **No Conflicts**

- ✅ Separate database tables for each module
- ✅ Separate API endpoints with clear naming (`GetVendor*` vs `Get*`)
- ✅ Separate entity models and DbSets
- ✅ Separate frontend services (`QuotationService` vs `VendorOrderService`)
- ✅ Separate frontend components (`CustomerQuotationSlideout` vs `VendorQuotationSlideout`)
- ✅ Clear routing separation (`/quotations/customer` vs `/quotations/vendor`, `/purchasing/vendor-orders`)


































