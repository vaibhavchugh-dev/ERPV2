import React, { useCallback, useEffect, useState } from "react";
import { NavLink, useHistory, useLocation } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
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
  faClipboardList,
  faShoppingBag,
  faTruck,
  faShieldAlt,
  faFolderOpen,
  faWarehouse,
  faBook,
  faTable,
  faLock,
  faTimes,
  faChevronRight,
} from "@fortawesome/free-solid-svg-icons";
import { AuthService } from "../Services/AuthService";
import "./Sidebar.scss";

interface NavItem {
  icon: IconDefinition;
  title: string;
  path: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

interface NavSection {
  id: string;
  title: string;
  icon: IconDefinition;
  items: NavItem[];
  groups?: NavGroup[];
}

const Sidebar: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const storage = JSON.parse(localStorage.getItem("storage") || "{}");
  const userName = storage?.userName || "User";
  const userRole = storage?.role || "Administrator";
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const filterByPermission = <T extends { path: string }>(items: T[]): T[] =>
    items.filter((item) => AuthService.hasPermissionForPath(item.path));

  const menuItems: NavItem[] = [
    { icon: faHome, title: "Dashboard", path: "/home" },
  ];

  const salesItems: NavItem[] = [
    { icon: faFileInvoice, title: "Customer Quotations", path: "/quotations/customer" },
    { icon: faShoppingCart, title: "Customer Orders", path: "/orders/customer" },
    { icon: faTruck, title: "Customer Shipments", path: "/orders/customer-shipments" },
    { icon: faFileInvoiceDollar, title: "Customer Invoices", path: "/orders/customer-invoices" },
    { icon: faBriefcase, title: "Job Orders", path: "/job-orders" },
  ];

  const qualityItems: NavItem[] = [
    { icon: faShieldAlt, title: "Non Conformance Reports", path: "/quality" },
    { icon: faTable, title: "NCR Code Master", path: "/quality/ncr-codes" },
  ];

  const reportsItems: NavItem[] = [
    { icon: faChartLine, title: "Business Intelligence", path: "/reports" },
  ];

  const purchasingItems: NavItem[] = [
    { icon: faFileInvoice, title: "Vendor Quotations", path: "/quotations/vendor" },
    { icon: faShoppingCart, title: "Vendor Orders", path: "/purchasing/vendor-orders" },
    { icon: faClipboardList, title: "Vendor Receiving", path: "/purchasing/vendor-receiving" },
    { icon: faFileInvoiceDollar, title: "Vendor Invoices", path: "/purchasing/vendor-invoices" },
    { icon: faWarehouse, title: "Inventory", path: "/inventory" },
  ];

  const documentsItems: NavItem[] = [
    { icon: faFolderOpen, title: "Documents", path: "/documents" },
  ];

  const filterGroups = (groups: NavGroup[]): NavGroup[] =>
    groups
      .map((group) => ({ ...group, items: filterByPermission(group.items) }))
      .filter((group) => group.items.length > 0);

  const accountingGroups = filterGroups([
    {
      title: "Payables & receivables",
      items: [
        { icon: faChartLine, title: "Payment Dashboard", path: "/accounts/dashboard" },
        { icon: faDollarSign, title: "Accounts Payable (AP)", path: "/accounts/payable" },
        { icon: faCreditCard, title: "Accounts Receivable (AR)", path: "/accounts/receivable" },
        { icon: faUniversity, title: "Bank Reconciliation", path: "/accounts/banks" },
      ],
    },
    {
      title: "Ledger & reporting",
      items: [
        { icon: faBook, title: "Journal Entries", path: "/accounts/journal-entries" },
        { icon: faTable, title: "GL Account Activity", path: "/accounts/general-ledger" },
        { icon: faFileInvoice, title: "Financial Reports", path: "/accounts/reports" },
        { icon: faLock, title: "Period Close & Audit", path: "/accounts/periods" },
      ],
    },
    {
      title: "Setup",
      items: [
        { icon: faCog, title: "Accounting Setup", path: "/accounts/setup" },
        { icon: faChartLine, title: "Chart of Accounts Master", path: "/masters/chartofaccounts" },
        { icon: faUniversity, title: "Bank Master", path: "/masters/bank" },
        { icon: faCreditCard, title: "Credit Card Master", path: "/masters/creditcard" },
      ],
    },
  ]);

  const accountingItems: NavItem[] = accountingGroups.flatMap((group) => group.items);

  const administrationGroups = filterGroups([
    {
      title: "Access & settings",
      items: [
        { icon: faUsers, title: "User Management", path: "/user-management" },
        { icon: faCog, title: "System Settings", path: "/settings" },
      ],
    },
    {
      title: "Business partners",
      items: [
        { icon: faUsers, title: "Customer Master", path: "/masters/customer" },
        { icon: faBuilding, title: "Vendor Master", path: "/masters/vendor" },
        { icon: faUserTie, title: "Employee Master", path: "/masters/employee" },
      ],
    },
    {
      title: "Shop floor & production",
      items: [
        { icon: faMapMarkerAlt, title: "Location Master", path: "/masters/location" },
        { icon: faDesktop, title: "Workstation Master", path: "/masters/workstation" },
        { icon: faCog, title: "Process Master", path: "/masters/process" },
        { icon: faClipboardList, title: "Job Template Master", path: "/masters/jobtemplate" },
      ],
    },
    {
      title: "Catalog & classification",
      items: [
        { icon: faBox, title: "Product Master", path: "/masters/product" },
        { icon: faBox, title: "Raw Material Master", path: "/masters/raw-material" },
        { icon: faDollarSign, title: "Price Breakdown Master", path: "/masters/pricebreakdown" },
        { icon: faTable, title: "Category Master", path: "/masters/category" },
      ],
    },
  ]);

  const administrationItems: NavItem[] = administrationGroups.flatMap((group) => group.items);

  const visibleMenuItems = filterByPermission(menuItems);

  const sections: NavSection[] = [
    { id: "sales", title: "Sales & Orders", icon: faClipboardList, items: filterByPermission(salesItems) },
    { id: "purchasing", title: "Purchasing", icon: faShoppingBag, items: filterByPermission(purchasingItems) },
    { id: "quality", title: "Quality", icon: faShieldAlt, items: filterByPermission(qualityItems) },
    { id: "documents", title: "Documents", icon: faFolderOpen, items: filterByPermission(documentsItems) },
    { id: "reports", title: "Reports", icon: faChartLine, items: filterByPermission(reportsItems) },
    {
      id: "accounting",
      title: "Accounting",
      icon: faDollarSign,
      items: accountingItems,
      groups: accountingGroups,
    },
    {
      id: "administration",
      title: "Administration",
      icon: faCog,
      items: administrationItems,
      groups: administrationGroups,
    },
  ];

  const openSection = sections.find((section) => section.id === activeSection) ?? null;

  const closeSecondary = useCallback(() => {
    setActiveSection(null);
  }, []);

  const handleSectionClick = (section: NavSection) => {
    if (section.items.length === 0) return;

    if (section.items.length === 1) {
      closeSecondary();
      history.push(section.items[0].path);
      return;
    }

    setActiveSection((current) => (current === section.id ? null : section.id));
  };

  const pathBelongsToSection = (section: NavSection, pathname: string) =>
    section.items.some(
      (item) => pathname === item.path || pathname.startsWith(`${item.path}/`)
    );

  const renderNavList = (items: NavItem[], sectionId: string) => (
    <ul className="nav-list">
      {items.map((item) => (
        <li key={item.path}>
          <NavLink
            to={item.path}
            className={`nav-item nav-item-${sectionId}`}
            activeClassName="active"
            onClick={closeSecondary}
          >
            <FontAwesomeIcon icon={item.icon} size="lg" />
            <span>{item.title}</span>
          </NavLink>
        </li>
      ))}
    </ul>
  );

  // Close secondary when leaving a multi-item section (e.g. navigating to /home).
  // Do not auto-open on refresh or initial load — only open on section click.
  useEffect(() => {
    if (location.pathname === "/home") {
      setActiveSection(null);
      return;
    }

    const matched = sections.find((section) =>
      pathBelongsToSection(section, location.pathname)
    );

    if (!matched || matched.items.length <= 1) {
      setActiveSection(null);
    }
    // Intentionally depend only on pathname so closing the panel is not undone on re-render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Escape closes secondary
  useEffect(() => {
    if (!activeSection) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeSecondary();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeSection, closeSecondary]);

  return (
    <div className="sidebar-shell">
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
            {visibleMenuItems.map((item) => (
              <div
                key={item.path}
                className="nav-dashboard-item"
                onClick={() => {
                  closeSecondary();
                  history.push(item.path);
                }}
              >
                <FontAwesomeIcon icon={item.icon} size="sm" />
                <span>{item.title}</span>
              </div>
            ))}
          </div>

          {sections.map((section) => {
            const isEmpty = section.items.length === 0;
            const hasFlyout = section.items.length > 1;
            const isOpen = hasFlyout && activeSection === section.id;
            const isCurrent = pathBelongsToSection(section, location.pathname);

            return (
              <div className="nav-section" key={section.id}>
                <div
                  className={`nav-section-header${isOpen ? " is-open" : ""}${isCurrent && !isOpen ? " is-active" : ""}${isEmpty ? " is-disabled" : ""}`}
                  onClick={() => handleSectionClick(section)}
                  role="button"
                  tabIndex={isEmpty ? -1 : 0}
                  aria-expanded={hasFlyout ? isOpen : undefined}
                  aria-disabled={isEmpty}
                  onKeyDown={(event) => {
                    if (isEmpty) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleSectionClick(section);
                    }
                  }}
                >
                  <FontAwesomeIcon icon={section.icon} size="sm" />
                  <span>{section.title}</span>
                  {hasFlyout && (
                    <FontAwesomeIcon
                      icon={faChevronRight}
                      size="sm"
                      className="nav-flyout-icon"
                    />
                  )}
                </div>
              </div>
            );
          })}
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

      {openSection && (
        <>
          <div
            className="sidebar-secondary-backdrop"
            onClick={closeSecondary}
            aria-hidden="true"
          />
          <aside
            className="sidebar-secondary"
            aria-label={openSection.title}
          >
            <div className="sidebar-secondary-header">
              <h2>{openSection.title}</h2>
              <button
                type="button"
                className="sidebar-secondary-close"
                onClick={closeSecondary}
                aria-label="Close menu"
              >
                <FontAwesomeIcon icon={faTimes} size="sm" />
              </button>
            </div>
            <nav className="sidebar-secondary-nav">
              {openSection.groups && openSection.groups.length > 0
                ? openSection.groups.map((group) => (
                    <div className="nav-group" key={group.title}>
                      <h3 className="nav-group-title">{group.title}</h3>
                      {renderNavList(group.items, openSection.id)}
                    </div>
                  ))
                : renderNavList(openSection.items, openSection.id)}
            </nav>
          </aside>
        </>
      )}
    </div>
  );
};

export default Sidebar;
