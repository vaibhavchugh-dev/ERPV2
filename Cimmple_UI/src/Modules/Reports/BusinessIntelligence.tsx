import React, { useState } from "react";
import { toast } from "react-toastify";
import {
  faChartLine,
  faChartBar,
  faChartPie,
  faUsers,
  faBox,
  faShoppingCart,
  faTruck,
  faShieldAlt,
  faFileInvoice,
  faDollarSign,
  faWarehouse,
  faBriefcase,
  faCalendar,
  faTable,
  faDownload,
  faEye,
  faFilter,
  faCalendarAlt,
  faChartArea,
  faDesktop,
  faCog,
  faMapMarkerAlt
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import "./BusinessIntelligence.scss";

interface ReportType {
  id: string;
  name: string;
  description: string;
  icon: any;
  category: string;
  status: "available" | "coming-soon";
}

const BusinessIntelligence: React.FC = () => {
  const [selectedReport, setSelectedReport] = useState<string>("");
  const [dateRange, setDateRange] = useState("This Month");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reportTypes: ReportType[] = [
    // Sales & Revenue Analytics
    {
      id: "sales-performance",
      name: "Sales Performance by Customer",
      description: "Analyze sales trends and performance metrics by customer",
      icon: faUsers,
      category: "Sales & Revenue",
      status: "coming-soon"
    },
    {
      id: "sales-trends",
      name: "Sales Trends Over Time",
      description: "View sales trends and patterns across different time periods",
      icon: faChartLine,
      category: "Sales & Revenue",
      status: "coming-soon"
    },
    {
      id: "product-revenue",
      name: "Product/Service Revenue Analysis",
      description: "Breakdown of revenue by product or service category",
      icon: faBox,
      category: "Sales & Revenue",
      status: "coming-soon"
    },
    {
      id: "quotation-conversion",
      name: "Quotation-to-Order Conversion",
      description: "Track conversion rates from quotations to actual orders",
      icon: faChartBar,
      category: "Sales & Revenue",
      status: "coming-soon"
    },
    {
      id: "revenue-by-location",
      name: "Revenue by Location/Region",
      description: "Geographic analysis of revenue distribution",
      icon: faMapMarkerAlt,
      category: "Sales & Revenue",
      status: "coming-soon"
    },

    // Operational Reports
    {
      id: "job-status-dashboard",
      name: "Job Order Status Dashboard",
      description: "Real-time view of all job orders and their current status",
      icon: faBriefcase,
      category: "Operations",
      status: "coming-soon"
    },
    {
      id: "job-completion-time",
      name: "Job Completion Time Analysis",
      description: "Analyze average completion times and identify bottlenecks",
      icon: faCalendar,
      category: "Operations",
      status: "coming-soon"
    },
    {
      id: "on-time-delivery",
      name: "On-Time Delivery Performance",
      description: "Track delivery performance and identify improvement areas",
      icon: faTruck,
      category: "Operations",
      status: "coming-soon"
    },
    {
      id: "production-efficiency",
      name: "Production Efficiency Metrics",
      description: "Measure production efficiency and throughput",
      icon: faChartArea,
      category: "Operations",
      status: "coming-soon"
    },
    {
      id: "workstation-utilization",
      name: "Workstation Utilization",
      description: "Monitor workstation usage and capacity planning",
      icon: faDesktop,
      category: "Operations",
      status: "coming-soon"
    },
    {
      id: "process-performance",
      name: "Process Performance Analysis",
      description: "Analyze performance metrics across different processes",
      icon: faCog,
      category: "Operations",
      status: "coming-soon"
    },

    // Purchasing & Vendor Analytics
    {
      id: "vendor-performance",
      name: "Vendor Performance Scorecard",
      description: "Comprehensive vendor performance metrics and ratings",
      icon: faChartBar,
      category: "Purchasing & Vendors",
      status: "coming-soon"
    },
    {
      id: "purchase-trends",
      name: "Purchase Order Trends",
      description: "Track purchasing patterns and trends over time",
      icon: faChartLine,
      category: "Purchasing & Vendors",
      status: "coming-soon"
    },
    {
      id: "vendor-cost-analysis",
      name: "Vendor Cost Analysis",
      description: "Compare costs across vendors and identify savings opportunities",
      icon: faDollarSign,
      category: "Purchasing & Vendors",
      status: "coming-soon"
    },
    {
      id: "material-cost-trends",
      name: "Material Cost Trends",
      description: "Monitor material cost changes and inflation impact",
      icon: faChartPie,
      category: "Purchasing & Vendors",
      status: "coming-soon"
    },
    {
      id: "vendor-delivery",
      name: "Vendor Delivery Performance",
      description: "Track vendor on-time delivery rates and reliability",
      icon: faTruck,
      category: "Purchasing & Vendors",
      status: "coming-soon"
    },

    // Inventory & Materials
    {
      id: "inventory-valuation",
      name: "Inventory Valuation Report",
      description: "Current inventory value and valuation methods",
      icon: faWarehouse,
      category: "Inventory & Materials",
      status: "coming-soon"
    },
    {
      id: "stock-movement",
      name: "Stock Movement Analysis",
      description: "Track inventory movements and turnover rates",
      icon: faBox,
      category: "Inventory & Materials",
      status: "coming-soon"
    },
    {
      id: "material-usage",
      name: "Material Usage Trends",
      description: "Analyze material consumption patterns",
      icon: faChartLine,
      category: "Inventory & Materials",
      status: "coming-soon"
    },
    {
      id: "inventory-turnover",
      name: "Inventory Turnover Analysis",
      description: "Measure how quickly inventory is sold and replaced",
      icon: faChartBar,
      category: "Inventory & Materials",
      status: "coming-soon"
    },

    // Quality Metrics
    {
      id: "ncr-trends",
      name: "NCR Trends Over Time",
      description: "Track non-conformance reports and quality issues",
      icon: faShieldAlt,
      category: "Quality Metrics",
      status: "coming-soon"
    },
    {
      id: "defect-rate",
      name: "Defect Rate by Process",
      description: "Identify processes with highest defect rates",
      icon: faChartPie,
      category: "Quality Metrics",
      status: "coming-soon"
    },
    {
      id: "quality-cost",
      name: "Quality Cost Analysis",
      description: "Measure cost of quality including prevention and failure costs",
      icon: faDollarSign,
      category: "Quality Metrics",
      status: "coming-soon"
    },
    {
      id: "root-cause-analysis",
      name: "Root Cause Analysis Summary",
      description: "Summary of root causes identified in quality issues",
      icon: faTable,
      category: "Quality Metrics",
      status: "coming-soon"
    },

    // Customer Analytics
    {
      id: "customer-profitability",
      name: "Customer Profitability Analysis",
      description: "Identify most and least profitable customers",
      icon: faUsers,
      category: "Customer Analytics",
      status: "coming-soon"
    },
    {
      id: "customer-lifetime-value",
      name: "Customer Lifetime Value",
      description: "Calculate and track customer lifetime value metrics",
      icon: faChartLine,
      category: "Customer Analytics",
      status: "coming-soon"
    },
    {
      id: "customer-order-history",
      name: "Customer Order History Trends",
      description: "Analyze customer ordering patterns and frequency",
      icon: faFileInvoice,
      category: "Customer Analytics",
      status: "coming-soon"
    },
    {
      id: "top-customers",
      name: "Top Customers by Revenue",
      description: "Rank customers by total revenue contribution",
      icon: faChartBar,
      category: "Customer Analytics",
      status: "coming-soon"
    },
    {
      id: "customer-payment-behavior",
      name: "Customer Payment Behavior",
      description: "Analyze payment patterns and credit risk",
      icon: faDollarSign,
      category: "Customer Analytics",
      status: "coming-soon"
    },

    // Financial KPIs & Dashboards
    {
      id: "revenue-expenses-trend",
      name: "Revenue vs Expenses Trend",
      description: "Compare revenue and expenses over time",
      icon: faChartLine,
      category: "Financial KPIs",
      status: "coming-soon"
    },
    {
      id: "gross-margin",
      name: "Gross Margin Analysis",
      description: "Track gross margin trends and profitability",
      icon: faChartArea,
      category: "Financial KPIs",
      status: "coming-soon"
    },
    {
      id: "operating-margin",
      name: "Operating Margin Trends",
      description: "Monitor operating efficiency and profitability",
      icon: faChartBar,
      category: "Financial KPIs",
      status: "coming-soon"
    },
    {
      id: "cash-flow-forecast",
      name: "Cash Flow Forecast",
      description: "Project future cash flows based on historical data",
      icon: faChartLine,
      category: "Financial KPIs",
      status: "coming-soon"
    },
    {
      id: "working-capital",
      name: "Working Capital Analysis",
      description: "Monitor working capital and liquidity metrics",
      icon: faDollarSign,
      category: "Financial KPIs",
      status: "coming-soon"
    }
  ];

  const categories = Array.from(new Set(reportTypes.map(report => report.category)));

  const getReportByCategory = (category: string) => {
    return reportTypes.filter(report => report.category === category);
  };

  const handleViewReport = (reportId: string) => {
    const report = reportTypes.find(r => r.id === reportId);
    if (report?.status === "coming-soon") {
      toast.info(`${report.name} is coming soon!`);
      return;
    }
    // TODO: Implement report viewing logic
    toast.info(`Opening ${report?.name}...`);
  };

  const handleDownloadReport = (reportId: string) => {
    const report = reportTypes.find(r => r.id === reportId);
    if (report?.status === "coming-soon") {
      toast.info(`${report.name} is coming soon!`);
      return;
    }
    // TODO: Implement report download logic
    toast.info(`Downloading ${report?.name}...`);
  };

  const filteredReports = selectedCategory
    ? reportTypes.filter(r => r.category === selectedCategory)
    : reportTypes;

  return (
    <div className="business-intelligence">
      {/* Header */}
      <div className="bi-header">
        <div>
          <h1>Business Intelligence</h1>
          <p>Analytics, insights, and performance metrics for data-driven decisions</p>
        </div>
        <div className="bi-controls">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="bi-date-select"
          >
            <option value="This Week">This Week</option>
            <option value="This Month">This Month</option>
            <option value="Last Month">Last Month</option>
            <option value="This Quarter">This Quarter</option>
            <option value="Last Quarter">Last Quarter</option>
            <option value="This Year">This Year</option>
            <option value="Last Year">Last Year</option>
            <option value="Custom">Custom Range</option>
          </select>
        </div>
      </div>

      {/* Category Filters */}
      <div className="bi-category-filters">
        <button
          className={`category-filter ${selectedCategory === null ? "active" : ""}`}
          onClick={() => setSelectedCategory(null)}
        >
          All Reports
        </button>
        {categories.map(category => (
          <button
            key={category}
            className={`category-filter ${selectedCategory === category ? "active" : ""}`}
            onClick={() => setSelectedCategory(category)}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Report Categories */}
      {categories
        .filter(cat => !selectedCategory || cat === selectedCategory)
        .map(category => (
          <div key={category} className="bi-category-section">
            <h3 className="bi-category-title">{category}</h3>
            <div className="bi-reports-grid">
              {getReportByCategory(category).map(report => (
                <div
                  key={report.id}
                  className={`bi-report-card ${report.status === "coming-soon" ? "coming-soon" : ""} ${selectedReport === report.id ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedReport(report.id);
                    if (report.status === "available") {
                      handleViewReport(report.id);
                    }
                  }}
                >
                  <div className="bi-report-header">
                    <div className="bi-report-icon">
                      <FontAwesomeIcon icon={report.icon} />
                    </div>
                    <div className="bi-report-info">
                      <h4>{report.name}</h4>
                      <p>{report.description}</p>
                    </div>
                  </div>
                  {report.status === "coming-soon" && (
                    <div className="bi-coming-soon-badge">Coming Soon</div>
                  )}
                  <div className="bi-report-actions">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewReport(report.id);
                      }}
                      disabled={report.status === "coming-soon"}
                      className="bi-action-btn bi-view-btn"
                    >
                      <FontAwesomeIcon icon={faEye} />
                      View
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadReport(report.id);
                      }}
                      disabled={report.status === "coming-soon"}
                      className="bi-action-btn bi-download-btn"
                    >
                      <FontAwesomeIcon icon={faDownload} />
                      Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

      {/* Info Section */}
      <div className="bi-info-section">
        <div className="bi-info-card">
          <FontAwesomeIcon icon={faChartLine} className="bi-info-icon" />
          <h3>Real-Time Analytics</h3>
          <p>Get up-to-date insights from your business data with real-time reporting capabilities.</p>
        </div>
        <div className="bi-info-card">
          <FontAwesomeIcon icon={faFilter} className="bi-info-icon" />
          <h3>Customizable Reports</h3>
          <p>Filter, drill down, and customize reports to meet your specific business needs.</p>
        </div>
        <div className="bi-info-card">
          <FontAwesomeIcon icon={faDownload} className="bi-info-icon" />
          <h3>Export & Share</h3>
          <p>Export reports in multiple formats and share insights with your team.</p>
        </div>
      </div>
    </div>
  );
};

export default BusinessIntelligence;

