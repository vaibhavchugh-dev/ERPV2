import React from "react";

const Dashboard = React.lazy(() => import("../Modules/Dashboard/Dashboard"));
const CustomerMaster = React.lazy(() => import("../Modules/Masters/CustomerMaster"));
const VendorMaster = React.lazy(() => import("../Modules/Masters/VendorMaster"));
const BankMaster = React.lazy(() => import("../Modules/Masters/BankMaster"));
const WorkstationMaster = React.lazy(() => import("../Modules/Masters/WorkstationMaster"));
const EmployeeMaster = React.lazy(() => import("../Modules/Masters/EmployeeMaster"));
const LocationMaster = React.lazy(() => import("../Modules/Masters/LocationMaster"));
const ProcessMaster = React.lazy(() => import("../Modules/Masters/ProcessMaster"));
const JobTemplateMaster = React.lazy(() => import("../Modules/Masters/JobTemplateMaster"));
const CategoryMaster = React.lazy(() => import("../Modules/Masters/CategoryMaster"));
const PriceBreakdownMaster = React.lazy(() => import("../Modules/Masters/PriceBreakdownMaster"));
const CreditCardMaster = React.lazy(() => import("../Modules/Masters/CreditCardMaster"));
const ChartofAccountsMaster = React.lazy(() => import("../Modules/Masters/ChartofAccountsMaster"));
const ProductMaster = React.lazy(() => import("../Modules/Masters/ProductMaster"));
const RawMaterialMaster = React.lazy(() => import("../Modules/Masters/RawMaterialMaster"));
const CustomerQuotations = React.lazy(() => import("../Modules/Quotations/CustomerQuotations"));
const VendorQuotations = React.lazy(() => import("../Modules/Quotations/VendorQuotations"));
const VendorOrders = React.lazy(() => import("../Modules/Purchasing/VendorOrders"));
const VendorReceiving = React.lazy(() => import("../Modules/Purchasing/VendorReceiving"));
const Inventory = React.lazy(() => import("../Modules/Inventory/Inventory"));
const VendorInvoices = React.lazy(() => import("../Modules/Purchasing/VendorInvoices"));
const CustomerOrders = React.lazy(() => import("../Modules/Orders/CustomerOrders"));
const CustomerShipments = React.lazy(() => import("../Modules/Orders/CustomerShipments"));
const CustomerInvoices = React.lazy(() => import("../Modules/Orders/CustomerInvoices"));
const JobOrders = React.lazy(() => import("../Modules/JobOrders/JobOrders"));
const UserManagement = React.lazy(() => import("../Modules/UserManagement/UserManagement"));
const Quality = React.lazy(() => import("../Modules/Quality/Quality"));
const PaymentDashboard = React.lazy(() => import("../Modules/Accounting/PaymentDashboard"));
const AccountsPayable = React.lazy(() => import("../Modules/Accounting/AccountsPayable"));
const AccountsReceivable = React.lazy(() => import("../Modules/Accounting/AccountsReceivable"));
const BankReconciliation = React.lazy(() => import("../Modules/Accounting/BankReconciliation"));
const FinancialReports = React.lazy(() => import("../Modules/Accounting/FinancialReports"));
const JournalEntries = React.lazy(() => import("../Modules/Accounting/JournalEntries"));
const GeneralLedger = React.lazy(() => import("../Modules/Accounting/GeneralLedger"));
const AccountingPeriods = React.lazy(() => import("../Modules/Accounting/AccountingPeriods"));
const AccountingSetup = React.lazy(() => import("../Modules/Accounting/AccountingSetup"));
const SystemSettings = React.lazy(() => import("../Modules/Settings/SystemSettings"));
const Documents = React.lazy(() => import("../Modules/Documents/Documents"));
const BusinessIntelligence = React.lazy(() => import("../Modules/Reports/BusinessIntelligence"));

export const protectedRoutes: any[] = [
  {
    path: "/home",
    name: "Dashboard",
    Component: Dashboard,
  },
  {
    path: "/masters/customer",
    name: "Customer Master",
    Component: CustomerMaster,
  },
  {
    path: "/masters/vendor",
    name: "Vendor Master",
    Component: VendorMaster,
  },
  {
    path: "/masters/bank",
    name: "Bank Master",
    Component: BankMaster,
  },
  {
    path: "/masters/workstation",
    name: "Workstation Master",
    Component: WorkstationMaster,
  },
  {
    path: "/masters/employee",
    name: "Employee Master",
    Component: EmployeeMaster,
  },
  {
    path: "/masters/location",
    name: "Location Master",
    Component: LocationMaster,
  },
  {
    path: "/masters/process",
    name: "Process Master",
    Component: ProcessMaster,
  },
  {
    path: "/masters/jobtemplate",
    name: "Job Template Master",
    Component: JobTemplateMaster,
  },
  {
    path: "/masters/category",
    name: "Category Master",
    Component: CategoryMaster,
  },
  {
    path: "/masters/pricebreakdown",
    name: "Price Breakdown Master",
    Component: PriceBreakdownMaster,
  },
  {
    path: "/masters/creditcard",
    name: "Credit Card Master",
    Component: CreditCardMaster,
  },
  {
    path: "/masters/chartofaccounts",
    name: "Chart of Accounts Master",
    Component: ChartofAccountsMaster,
  },
  {
    path: "/masters/product",
    name: "Product Master",
    Component: ProductMaster,
  },
  {
    path: "/masters/raw-material",
    name: "Raw Material Master",
    Component: RawMaterialMaster,
  },
  {
    path: "/user-management",
    name: "User Management",
    Component: UserManagement,
  },
  {
    path: "/quotations/customer",
    name: "Customer Quotations",
    Component: CustomerQuotations,
  },
  {
    path: "/quotations/vendor",
    name: "Vendor Quotations",
    Component: VendorQuotations,
  },
  {
    path: "/purchasing/vendor-orders",
    name: "Vendor Orders",
    Component: VendorOrders,
  },
  {
    path: "/purchasing/vendor-receiving",
    name: "Vendor Receiving",
    Component: VendorReceiving,
  },
  {
    path: "/purchasing/vendor-invoices",
    name: "Vendor Invoices",
    Component: VendorInvoices,
  },
  {
    path: "/inventory",
    name: "Inventory",
    Component: Inventory,
  },
  {
    path: "/orders/customer",
    name: "Customer Orders",
    Component: CustomerOrders,
  },
  {
    path: "/orders/customer-shipments",
    name: "Customer Shipments",
    Component: CustomerShipments,
  },
  {
    path: "/orders/customer-invoices",
    name: "Customer Invoices",
    Component: CustomerInvoices,
  },
  {
    path: "/job-orders",
    name: "Job Orders",
    Component: JobOrders,
  },
  {
    path: "/quality",
    name: "Quality",
    Component: Quality,
  },
  {
    path: "/accounts/dashboard",
    name: "Payment Dashboard",
    Component: PaymentDashboard,
  },
  {
    path: "/accounts/payable",
    name: "Accounts Payable",
    Component: AccountsPayable,
  },
  {
    path: "/accounts/receivable",
    name: "Accounts Receivable",
    Component: AccountsReceivable,
  },
  {
    path: "/accounts/banks",
    name: "Bank Reconciliation",
    Component: BankReconciliation,
  },
  {
    path: "/accounts/reports",
    name: "Financial Reports",
    Component: FinancialReports,
  },
  {
    path: "/accounts/journal-entries",
    name: "Journal Entries",
    Component: JournalEntries,
  },
  {
    path: "/accounts/general-ledger",
    name: "GL Account Activity",
    Component: GeneralLedger,
  },
  {
    path: "/accounts/periods",
    name: "Period Close & Audit",
    Component: AccountingPeriods,
  },
  {
    path: "/accounts/setup",
    name: "Accounting Setup",
    Component: AccountingSetup,
  },
  {
    path: "/settings",
    name: "System Settings",
    Component: SystemSettings,
  },
  {
    path: "/documents",
    name: "Documents",
    Component: Documents,
  },
  {
    path: "/reports",
    name: "Business Intelligence",
    Component: BusinessIntelligence,
  },
];
