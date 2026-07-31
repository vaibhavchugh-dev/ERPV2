import React from "react";
import CustomerMaster from "../Modules/Masters/CustomerMaster";
import VendorMaster from "../Modules/Masters/VendorMaster";
import BankMaster from "../Modules/Masters/BankMaster";
import WorkstationMaster from "../Modules/Masters/WorkstationMaster";
import EmployeeMaster from "../Modules/Masters/EmployeeMaster";
import LocationMaster from "../Modules/Masters/LocationMaster";
import ProcessMaster from "../Modules/Masters/ProcessMaster";
import JobTemplateMaster from "../Modules/Masters/JobTemplateMaster";
import CategoryMaster from "../Modules/Masters/CategoryMaster";
import PriceBreakdownMaster from "../Modules/Masters/PriceBreakdownMaster";
import CreditCardMaster from "../Modules/Masters/CreditCardMaster";
import ChartofAccountsMaster from "../Modules/Masters/ChartofAccountsMaster";
import ProductMaster from "../Modules/Masters/ProductMaster";
import RawMaterialMaster from "../Modules/Masters/RawMaterialMaster";
import CustomerQuotations from "../Modules/Quotations/CustomerQuotations";
import VendorQuotations from "../Modules/Quotations/VendorQuotations";
import VendorOrders from "../Modules/Purchasing/VendorOrders";
import VendorReceiving from "../Modules/Purchasing/VendorReceiving";
import Inventory from "../Modules/Inventory/Inventory";
import VendorInvoices from "../Modules/Purchasing/VendorInvoices";
import CustomerOrders from "../Modules/Orders/CustomerOrders";
import CustomerShipments from "../Modules/Orders/CustomerShipments";
import CustomerInvoices from "../Modules/Orders/CustomerInvoices";
import JobOrders from "../Modules/JobOrders/JobOrders";
import UserManagement from "../Modules/UserManagement/UserManagement";
import Quality from "../Modules/Quality/Quality";
import PaymentDashboard from "../Modules/Accounting/PaymentDashboard";
import AccountsPayable from "../Modules/Accounting/AccountsPayable";
import AccountsReceivable from "../Modules/Accounting/AccountsReceivable";
import BankReconciliation from "../Modules/Accounting/BankReconciliation";
import FinancialReports from "../Modules/Accounting/FinancialReports";
import JournalEntries from "../Modules/Accounting/JournalEntries";
import GeneralLedger from "../Modules/Accounting/GeneralLedger";
import AccountingPeriods from "../Modules/Accounting/AccountingPeriods";
import AccountingSetup from "../Modules/Accounting/AccountingSetup";
import SystemSettings from "../Modules/Settings/SystemSettings";
import Documents from "../Modules/Documents/Documents";
import BusinessIntelligence from "../Modules/Reports/BusinessIntelligence";
import Dashboard from "../Modules/Dashboard/Dashboard";

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