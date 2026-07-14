# Global Search Coverage

## ✅ Currently Included in Search

Based on `GlobalSearchController.cs`, the following entities are searchable:

### 1. **Customers** ✅
- **Table**: `CustomerMaster`
- **Search Fields**: Company name, Customer code, Email, Phone number
- **Page**: `/masters/customer`

### 2. **Vendors** ✅
- **Table**: `VendorMaster`
- **Search Fields**: Company name, Vendor code, Email, Phone number
- **Page**: `/masters/vendor`

### 3. **Customer Orders** ✅
- **Table**: `CustomerOrder`
- **Search Fields**: Order number (PONumber), Customer name, Customer PO number
- **Page**: `/orders/customer`

### 4. **Customer Invoices** ✅
- **Table**: `InvoiceMaster` (joined with `CustomerOrder`)
- **Search Fields**: Invoice number, Prefix invoice number, Customer name
- **Page**: `/orders/customer-invoices`

### 5. **Job Orders** ✅
- **Table**: `JobOrderMaster`
- **Search Fields**: Job order number, Part number, Part name, Customer name, Job number
- **Page**: `/job-orders`

### 6. **Customer Quotations** ✅
- **Table**: `QuotationOrder`
- **Search Fields**: Quotation number (PONumber), Customer name
- **Page**: `/quotations/customer`

---

## ❌ Currently NOT Included in Search

### Masters (8 missing)
1. **Bank Master** ❌
   - **Table**: `BankMaster`
   - **Page**: `/masters/bank`
   - **Could search**: Bank name, Account number, Bank code

2. **Workstation Master** ❌
   - **Table**: `WorkstationMaster`
   - **Page**: `/masters/workstation`
   - **Could search**: Workstation name, Workstation code

3. **Employee Master** ❌
   - **Table**: `EmployeeMaster`
   - **Page**: `/masters/employee`
   - **Could search**: Employee name, Employee ID, Email

4. **Location Master** ❌
   - **Table**: `LocationMaster`
   - **Page**: `/masters/location`
   - **Could search**: Location name, Location code

5. **Process Master** ❌
   - **Table**: `ProcessMaster`
   - **Page**: `/masters/process`
   - **Could search**: Process name, Process code

6. **Price Breakdown Master** ❌
   - **Table**: `PriceBreakdownMaster`
   - **Page**: `/masters/pricebreakdown`
   - **Could search**: Price breakdown name, Code

7. **Credit Card Master** ❌
   - **Table**: `CreditCardMaster`
   - **Page**: `/masters/creditcard`
   - **Could search**: Credit card name, Card number (last 4 digits)

8. **Chart of Accounts Master** ❌
   - **Table**: `ChartofAccountsMaster`
   - **Page**: `/masters/chartofaccounts`
   - **Could search**: Account name, Account number, Account code

### Purchasing (3 missing)
1. **Vendor Orders** ❌
   - **Table**: `VendorOrder` (if exists)
   - **Page**: `/purchasing/vendor-orders`
   - **Could search**: Vendor order number, Vendor name, PO number

2. **Vendor Receiving** ❌
   - **Table**: `VendorReceiving` (if exists)
   - **Page**: `/purchasing/vendor-receiving`
   - **Could search**: Receiving number, Vendor name, Order reference

3. **Vendor Invoices** ❌
   - **Table**: `VendorInvoiceMaster` (if exists)
   - **Page**: `/purchasing/vendor-invoices`
   - **Could search**: Invoice number, Vendor name, Invoice date

### Quotations (1 missing)
1. **Vendor Quotations** ❌
   - **Table**: `VendorQuotationOrder` (if exists)
   - **Page**: `/quotations/vendor`
   - **Could search**: Quotation number, Vendor name

### Orders (1 missing)
1. **Customer Shipments** ❌
   - **Table**: `CustomerShipment` (if exists)
   - **Page**: `/orders/customer-shipments`
   - **Could search**: Shipment number, Tracking number, Customer name

### Quality (1 missing)
1. **Non-Conformance Reports (NCR)** ❌
   - **Table**: `NonConformanceReport` (if exists)
   - **Page**: `/quality`
   - **Could search**: NCR number, Part number, Job order number, Customer name

### User Management (1 missing)
1. **Users** ❌
   - **Table**: `User` (if exists)
   - **Page**: `/user-management`
   - **Could search**: User name, Email, Username

### Accounting (6 missing - likely not searchable by design)
These are typically reports/dashboards, not transactional data:
- Payment Dashboard (`/accounts/dashboard`)
- Accounts Payable (`/accounts/payable`)
- Accounts Receivable (`/accounts/receivable`)
- Bank Reconciliation (`/accounts/banks`)
- Financial Reports (`/accounts/reports`)
- Accounting Setup (`/accounts/setup`)

### Settings (1 missing - likely not searchable by design)
- System Settings (`/settings`) - Configuration, not searchable data

---

## Summary

**Currently Searchable**: 6 entity types
- Customers
- Vendors
- Customer Orders
- Customer Invoices
- Job Orders
- Customer Quotations

**Not Searchable**: ~15 entity types
- 8 Master data types
- 3 Purchasing entities
- 1 Vendor Quotation
- 1 Customer Shipment
- 1 Quality (NCR)
- 1 User Management

**Total Coverage**: ~29% of searchable entities

---

## Recommendations

### High Priority (Most Used)
1. **Vendor Orders** - Frequently searched
2. **Vendor Invoices** - Important for AP workflow
3. **Customer Shipments** - Important for tracking
4. **Vendor Quotations** - Completes quotation search

### Medium Priority
5. **Employee Master** - Useful for HR/searching employees
6. **Bank Master** - Useful for accounting
7. **Non-Conformance Reports** - Important for quality tracking

### Low Priority
8. **Other Master data** - Less frequently searched individually
















