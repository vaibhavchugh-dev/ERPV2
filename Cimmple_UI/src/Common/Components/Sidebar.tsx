import React, { useState } from "react";
import { NavLink, useHistory } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHome,
  faUsers,
  faBox,
  faBuilding,
  faUser,
  faUniversity,
  faDesktop,
  faUserTie,
  faMapMarkerAlt,
  faCog,
  faDollarSign,
  faCreditCard,
  faChartLine,
  faFileInvoice,
  faFileInvoiceDollar,
  faShoppingCart,
  faBriefcase,
  faChevronDown,
  faChevronRight,
  faClipboardList,
  faShoppingBag,
  faTruck,
  faShieldAlt,
  faFolderOpen,
  faWarehouse,
  faBook,
  faTable,
  faLock
} from "@fortawesome/free-solid-svg-icons";
import { User } from "../Services/User";
import "./Sidebar.scss";

const Sidebar: React.FC = () => {
  const history = useHistory();
  const storage = JSON.parse(localStorage.getItem("storage") || "{}");
  const userName = storage?.userName || "User";
  const userRole = storage?.role || "Administrator";
  const [activeSection, setActiveSection] = useState<string | null>(null); // All collapsed by default

  // Helper function to handle section toggle (accordion behavior)
  const toggleSection = (sectionName: string) => {
    setActiveSection(activeSection === sectionName ? null : sectionName);
  };

  const menuItems = [
    {
      icon: faHome,
      title: "Dashboard",
      path: "/home",
    },
  ];

  const salesItems = [
    {
      icon: faFileInvoice,
      title: "Customer Quotations",
      path: "/quotations/customer",
    },
    {
      icon: faShoppingCart,
      title: "Customer Orders",
      path: "/orders/customer",
    },
    {
      icon: faTruck,
      title: "Customer Shipments",
      path: "/orders/customer-shipments",
    },
    {
      icon: faFileInvoiceDollar,
      title: "Customer Invoices",
      path: "/orders/customer-invoices",
    },
    {
      icon: faBriefcase,
      title: "Job Orders",
      path: "/job-orders",
    },
  ];

  const qualityItems = [
    {
      icon: faShieldAlt,
      title: "Non Conformance Reports",
      path: "/quality",
    },
  ];

  const reportsItems = [
    {
      icon: faChartLine,
      title: "Business Intelligence",
      path: "/reports",
    },
  ];

  const purchasingItems = [
    {
      icon: faFileInvoice,
      title: "Vendor Quotations",
      path: "/quotations/vendor",
    },
    {
      icon: faShoppingCart,
      title: "Vendor Orders",
      path: "/purchasing/vendor-orders",
    },
    {
      icon: faClipboardList,
      title: "Vendor Receiving",
      path: "/purchasing/vendor-receiving",
    },
    {
      icon: faFileInvoiceDollar,
      title: "Vendor Invoices",
      path: "/purchasing/vendor-invoices",
    },
    {
      icon: faWarehouse,
      title: "Inventory",
      path: "/inventory",
    },
  ];

  const accountingItems = [
    {
      icon: faChartLine,
      title: "Payment Dashboard",
      path: "/accounts/dashboard",
    },
    {
      icon: faDollarSign,
      title: "Accounts Payable (AP)",
      path: "/accounts/payable",
    },
    {
      icon: faCreditCard,
      title: "Accounts Receivable (AR)",
      path: "/accounts/receivable",
    },
    {
      icon: faUniversity,
      title: "Bank Reconciliation",
      path: "/accounts/banks",
    },
    {
      icon: faFileInvoice,
      title: "Financial Reports",
      path: "/accounts/reports",
    },
    {
      icon: faBook,
      title: "Journal Entries",
      path: "/accounts/journal-entries",
    },
    {
      icon: faTable,
      title: "GL Account Activity",
      path: "/accounts/general-ledger",
    },
    {
      icon: faLock,
      title: "Period Close & Audit",
      path: "/accounts/periods",
    },
    {
      icon: faCog,
      title: "Accounting Setup",
      path: "/accounts/setup",
    },
    {
      icon: faUniversity,
      title: "Bank Master",
      path: "/masters/bank",
    },
    {
      icon: faCreditCard,
      title: "Credit Card Master",
      path: "/masters/creditcard",
    },
    {
      icon: faChartLine,
      title: "Chart of Accounts Master",
      path: "/masters/chartofaccounts",
    },
  ];

  const documentsItems = [
    {
      icon: faFolderOpen,
      title: "Documents",
      path: "/documents",
    },
  ];

  const administrationItems = [
    {
      icon: faUsers,
      title: "User Management",
      path: "/user-management",
    },
    {
      icon: faCog,
      title: "System Settings",
      path: "/settings",
    },
    {
      icon: faUsers,
      title: "Customer Master",
      path: "/masters/customer",
    },
    {
      icon: faBuilding,
      title: "Vendor Master",
      path: "/masters/vendor",
    },
    {
      icon: faDesktop,
      title: "Workstation Master",
      path: "/masters/workstation",
    },
    {
      icon: faUserTie,
      title: "Employee Master",
      path: "/masters/employee",
    },
    {
      icon: faMapMarkerAlt,
      title: "Location Master",
      path: "/masters/location",
    },
    {
      icon: faCog,
      title: "Process Master",
      path: "/masters/process",
    },
    {
      icon: faClipboardList,
      title: "Job Template Master",
      path: "/masters/jobtemplate",
    },
    {
      icon: faTable,
      title: "Category Master",
      path: "/masters/category",
    },
    {
      icon: faDollarSign,
      title: "Price Breakdown Master",
      path: "/masters/pricebreakdown",
    },
    {
      icon: faBox,
      title: "Product Master",
      path: "/masters/product",
    },
    {
      icon: faBox,
      title: "Raw Material Master",
      path: "/masters/raw-material",
    },
  ];

  console.log("Sidebar rendering - Sales & Orders, Purchasing, Quality, Accounting, Administration");

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <div className="brand-logo">
            <img src="/logo.svg" alt="Cimmple ERP" width="50" height="50" />
          </div>
          <div className="brand-text">
            <h1>Cimmple ERP</h1>
            <span>Business Portal</span>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section">
          {menuItems.map((item, index) => (
            <div
              key={index}
              className="nav-dashboard-item"
              onClick={() => {
                // Navigate to dashboard
                history.push(item.path);
              }}
              style={{ cursor: 'pointer' }}
            >
              <FontAwesomeIcon icon={item.icon} size="sm" />
              <span>{item.title}</span>
            </div>
          ))}
        </div>

        <div className="nav-section">
          <div
            className="nav-section-header"
            onClick={() => toggleSection('sales')}
          >
            <FontAwesomeIcon icon={faClipboardList} size="sm" />
            <span>Sales & Orders</span>
            <FontAwesomeIcon
              icon={activeSection === 'sales' ? faChevronDown : faChevronRight}
              size="sm"
              className="nav-toggle-icon"
            />
          </div>
          {activeSection === 'sales' && (
            <ul className="nav-list">
              {salesItems.map((item, index) => (
                <li key={`sales-${index}`}>
                  <NavLink
                    to={item.path}
                    className="nav-item nav-item-sales"
                    activeClassName="active"
                  >
                    <FontAwesomeIcon icon={item.icon} size="lg" />
                    <span>{item.title}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="nav-section">
          <div
            className="nav-section-header"
            onClick={() => toggleSection('purchasing')}
          >
            <FontAwesomeIcon icon={faShoppingBag} size="sm" />
            <span>Purchasing</span>
            <FontAwesomeIcon
              icon={activeSection === 'purchasing' ? faChevronDown : faChevronRight}
              size="sm"
              className="nav-toggle-icon"
            />
          </div>
          {activeSection === 'purchasing' && (
            <ul className="nav-list">
              {purchasingItems.map((item, index) => (
                <li key={`purchasing-${index}`}>
                  <NavLink
                    to={item.path}
                    className="nav-item nav-item-purchasing"
                    activeClassName="active"
                  >
                    <FontAwesomeIcon icon={item.icon} size="lg" />
                    <span>{item.title}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="nav-section">
          <div
            className="nav-section-header"
            onClick={() => toggleSection('quality')}
          >
            <FontAwesomeIcon icon={faShieldAlt} size="sm" />
            <span>Quality</span>
            <FontAwesomeIcon
              icon={activeSection === 'quality' ? faChevronDown : faChevronRight}
              size="sm"
              className="nav-toggle-icon"
            />
          </div>
          {activeSection === 'quality' && (
            <ul className="nav-list">
              {qualityItems.map((item, index) => (
                <li key={`quality-${index}`}>
                  <NavLink
                    to={item.path}
                    className="nav-item nav-item-quality"
                    activeClassName="active"
                  >
                    <FontAwesomeIcon icon={item.icon} size="lg" />
                    <span>{item.title}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="nav-section">
          <div
            className="nav-section-header"
            onClick={() => toggleSection('documents')}
          >
            <FontAwesomeIcon icon={faFolderOpen} size="sm" />
            <span>Documents</span>
            <FontAwesomeIcon
              icon={activeSection === 'documents' ? faChevronDown : faChevronRight}
              size="sm"
              className="nav-toggle-icon"
            />
          </div>
          {activeSection === 'documents' && (
            <ul className="nav-list">
              {documentsItems.map((item, index) => (
                <li key={`documents-${index}`}>
                  <NavLink
                    to={item.path}
                    className="nav-item nav-item-documents"
                    activeClassName="active"
                  >
                    <FontAwesomeIcon icon={item.icon} size="lg" />
                    <span>{item.title}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="nav-section">
          <div
            className="nav-section-header"
            onClick={() => toggleSection('reports')}
          >
            <FontAwesomeIcon icon={faChartLine} size="sm" />
            <span>Reports</span>
            <FontAwesomeIcon
              icon={activeSection === 'reports' ? faChevronDown : faChevronRight}
              size="sm"
              className="nav-toggle-icon"
            />
          </div>
          {activeSection === 'reports' && (
            <ul className="nav-list">
              {reportsItems.map((item, index) => (
                <li key={`reports-${index}`}>
                  <NavLink
                    to={item.path}
                    className="nav-item nav-item-reports"
                    activeClassName="active"
                  >
                    <FontAwesomeIcon icon={item.icon} size="lg" />
                    <span>{item.title}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="nav-section">
          <div
            className="nav-section-header"
            onClick={() => toggleSection('accounting')}
          >
            <FontAwesomeIcon icon={faDollarSign} size="sm" />
            <span>Accounting</span>
            <FontAwesomeIcon
              icon={activeSection === 'accounting' ? faChevronDown : faChevronRight}
              size="sm"
              className="nav-toggle-icon"
            />
          </div>
          {activeSection === 'accounting' && (
            <ul className="nav-list">
              {accountingItems.map((item, index) => (
                <li key={`accounting-${index}`}>
                  <NavLink
                    to={item.path}
                    className="nav-item nav-item-accounting"
                    activeClassName="active"
                  >
                    <FontAwesomeIcon icon={item.icon} size="lg" />
                    <span>{item.title}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="nav-section">
          <div
            className="nav-section-header"
            onClick={() => toggleSection('administration')}
          >
            <FontAwesomeIcon icon={faCog} size="sm" />
            <span>Administration</span>
            <FontAwesomeIcon
              icon={activeSection === 'administration' ? faChevronDown : faChevronRight}
              size="sm"
              className="nav-toggle-icon"
            />
          </div>
          {activeSection === 'administration' && (
            <ul className="nav-list">
              {administrationItems.map((item, index) => (
                <li key={`administration-${index}`}>
                  <NavLink
                    to={item.path}
                    className="nav-item nav-item-administration"
                    activeClassName="active"
                  >
                    <FontAwesomeIcon icon={item.icon} size="lg" />
                    <span>{item.title}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          )}
        </div>
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="user-avatar">
            <FontAwesomeIcon icon={faUser} size="sm" />
          </div>
          <div className="user-info">
            <div className="user-name">{userName}</div>
            <div className="user-role">{userRole}</div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
