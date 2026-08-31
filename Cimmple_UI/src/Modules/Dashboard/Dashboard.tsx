import React, { useState, useEffect } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import {
  faBriefcase,
  faCheckCircle,
  faDollarSign,
  faExclamationTriangle,
  faShieldAlt,
  faShoppingCart,
  faTruck,
  faChartLine,
  faChartBar,
  faChartPie,
  faUsers,
  faBox,
  faFileInvoice,
  faCalendar,
  faClock,
  faArrowUp,
  faArrowDown,
  faSync,
  faPlus,
  faEye,
  faFilter
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";
import {
  DashboardService,
  DashboardMetrics,
  ProductionStatus,
  RevenueTrends,
  RecentActivity,
  Alert,
  TopCustomer,
  TopProduct,
  QualityStatus,
  UpcomingDeadline
} from "../../Common/Services/DashboardService";
import { useFormatting } from "../../Common/Hooks/useFormatting";
import "./Dashboard.scss";

const Dashboard: React.FC = () => {
  const history = useHistory();
  const { formatCurrency } = useFormatting();
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState("This Month");
  const [productionPeriod, setProductionPeriod] = useState("This Week");
  const [revenuePeriod, setRevenuePeriod] = useState("30days");
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [productionStatus, setProductionStatus] = useState<ProductionStatus | null>(null);
  const [revenueTrends, setRevenueTrends] = useState<RevenueTrends | null>(null);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [qualityStatus, setQualityStatus] = useState<QualityStatus[]>([]);
  const [upcomingDeadlines, setUpcomingDeadlines] = useState<UpcomingDeadline[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, [dateRange]);

  useEffect(() => {
    DashboardService.GetProductionStatus(productionPeriod).then((d) => d && setProductionStatus(d));
  }, [productionPeriod]);

  useEffect(() => {
    DashboardService.GetRevenueTrends(revenuePeriod).then((d) => d && setRevenueTrends(d));
  }, [revenuePeriod]);

  const loadDashboardData = async () => {
    setLoading(true);
    let metricsFailed = false;

    // Critical path: unblock the shell as soon as metrics arrive.
    try {
      const metricsData = await DashboardService.GetMetrics(dateRange);
      if (metricsData) setMetrics(metricsData);
    } catch (error) {
      metricsFailed = true;
      console.error("Error loading dashboard metrics:", error);
      toast.error("Failed to load dashboard metrics");
    } finally {
      setLoading(false);
    }

    // Secondary widgets load in parallel and paint as each completes.
    const secondary = [
      DashboardService.GetProductionStatus(productionPeriod).then((d) => d && setProductionStatus(d)),
      DashboardService.GetRevenueTrends(revenuePeriod).then((d) => d && setRevenueTrends(d)),
      DashboardService.GetRecentActivities(20).then((d) => d && setRecentActivities(d)),
      DashboardService.GetAlerts().then((d) => d && setAlerts(d)),
      DashboardService.GetTopCustomers(5).then((d) => d && setTopCustomers(d)),
      DashboardService.GetTopProducts(5).then((d) => d && setTopProducts(d)),
      DashboardService.GetQualityStatus().then((d) => d && setQualityStatus(d)),
      DashboardService.GetUpcomingDeadlines(7).then((d) => d && setUpcomingDeadlines(d)),
    ];

    const results = await Promise.allSettled(secondary);
    if (!metricsFailed && results.some((r) => r.status === "rejected")) {
      console.error("Some dashboard widgets failed to load", results);
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "job_order":
        return faBriefcase;
      case "shipment":
        return faTruck;
      case "invoice":
        return faFileInvoice;
      case "ncr":
        return faShieldAlt;
      default:
        return faBox;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case "job_order":
        return "#3b82f6";
      case "shipment":
        return "#10b981";
      case "invoice":
        return "#8b5cf6";
      case "ncr":
        return "#f59e0b";
      default:
        return "#6b7280";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "#ef4444";
      case "medium":
        return "#f59e0b";
      case "low":
        return "#6b7280";
      default:
        return "#6b7280";
    }
  };

  const handleNavigate = (entityType: string, entityId: number) => {
    const returnState = { returnTo: "/home" };
    switch (entityType) {
      case "JobOrder":
        history.push(`/job-orders?open=${entityId}`, returnState);
        break;
      case "Order":
      case "CustomerOrder":
        history.push(`/orders/customer?open=${entityId}`, returnState);
        break;
      case "Shipment":
        history.push(`/orders/customer-shipments?open=${entityId}`, returnState);
        break;
      case "Invoice":
        history.push(`/orders/customer-invoices?open=${entityId}`, returnState);
        break;
      case "VendorInvoice":
        history.push(`/purchasing/vendor-invoices?open=${entityId}`, returnState);
        break;
      case "NCR":
        history.push(`/quality?open=${entityId}`, returnState);
        break;
      default:
        break;
    }
  };

  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

  if (loading) {
    return (
      <div className="dashboard">
        <div className="dashboard-loading">
          <FontAwesomeIcon icon={faSync} spin />
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p>Overview of your manufacturing operations</p>
        </div>
        <div className="dashboard-controls">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="dashboard-date-select"
          >
            <option value="This Week">This Week</option>
            <option value="This Month">This Month</option>
            <option value="Last Month">Last Month</option>
            <option value="This Quarter">This Quarter</option>
            <option value="This Year">This Year</option>
          </select>
          <button onClick={loadDashboardData} className="dashboard-refresh-btn">
            <FontAwesomeIcon icon={faSync} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="dashboard-kpis">
        {/* Production KPIs */}
        <div className="kpi-card" onClick={() => history.push("/job-orders")}>
          <div className="kpi-icon" style={{ backgroundColor: "#eff6ff" }}>
            <FontAwesomeIcon icon={faBriefcase} style={{ color: "#3b82f6" }} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">{metrics?.production.activeJobOrders || 0}</div>
            <div className="kpi-label">Active Job Orders</div>
            <div className="kpi-trend">
              <FontAwesomeIcon icon={faArrowUp} style={{ color: "#10b981" }} />
              <span>{metrics?.production.jobsCompletedToday || 0} completed today</span>
            </div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ backgroundColor: "#f0fdf4" }}>
            <FontAwesomeIcon icon={faCheckCircle} style={{ color: "#10b981" }} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">{metrics?.production.onTimeDeliveryRate?.toFixed(1) || 0}%</div>
            <div className="kpi-label">On-Time Delivery</div>
            <div className="kpi-trend">
              <span>{metrics?.production.jobsCompletedThisWeek || 0} completed this week</span>
            </div>
          </div>
        </div>

        {/* Financial KPIs */}
        <div className="kpi-card" onClick={() => history.push("/accounts/receivable")}>
          <div className="kpi-icon" style={{ backgroundColor: "#fef3c7" }}>
            <FontAwesomeIcon icon={faDollarSign} style={{ color: "#f59e0b" }} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">{formatCurrency(metrics?.financial.totalReceivables || 0)}</div>
            <div className="kpi-label">Total Receivables</div>
            <div className="kpi-trend">
              <span>Revenue: {formatCurrency(metrics?.financial.revenueThisMonth || 0)}</span>
            </div>
          </div>
        </div>

        <div className="kpi-card" onClick={() => history.push("/accounts/payable")}>
          <div className="kpi-icon" style={{ backgroundColor: "#fee2e2" }}>
            <FontAwesomeIcon icon={faFileInvoice} style={{ color: "#ef4444" }} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">{formatCurrency(metrics?.financial.totalPayables || 0)}</div>
            <div className="kpi-label">Total Payables</div>
            <div className="kpi-trend">
              <span>Net Cash Flow: {formatCurrency(metrics?.financial.netCashFlow || 0)}</span>
            </div>
          </div>
        </div>

        {/* Quality KPIs */}
        <div className="kpi-card" onClick={() => history.push("/quality")}>
          <div className="kpi-icon" style={{ backgroundColor: "#fef3c7" }}>
            <FontAwesomeIcon icon={faShieldAlt} style={{ color: "#f59e0b" }} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">{metrics?.quality.openNCRs || 0}</div>
            <div className="kpi-label">Open NCRs</div>
            <div className="kpi-trend">
              <span>{metrics?.quality.ncrResolvedThisWeek || 0} resolved this week</span>
            </div>
          </div>
        </div>

        {/* Operational KPIs */}
        <div className="kpi-card" onClick={() => history.push("/orders/customer")}>
          <div className="kpi-icon" style={{ backgroundColor: "#eff6ff" }}>
            <FontAwesomeIcon icon={faShoppingCart} style={{ color: "#3b82f6" }} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">{metrics?.operational.pendingCustomerOrders || 0}</div>
            <div className="kpi-label">Pending Orders</div>
            <div className="kpi-trend">
              <span>{metrics?.operational.overdueShipments || 0} overdue shipments</span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="dashboard-charts">
        {/* Production Status Chart - Row 1, Col 1 */}
        <div className="dashboard-widget chart-widget-left chart-widget-row-1">
          <div className="widget-header">
            <h3>Production Status</h3>
            <select
              className="widget-period-select"
              value={productionPeriod}
              onChange={(e) => setProductionPeriod(e.target.value)}
            >
              <option value="This Week">This Week</option>
              <option value="This Month">This Month</option>
              <option value="This Quarter">This Quarter</option>
            </select>
          </div>
          <div className="widget-content">
            {productionStatus && productionStatus.jobOrdersByStatus.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={productionStatus.jobOrdersByStatus}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="status" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="widget-empty">No production data available</div>
            )}
          </div>
        </div>

        {/* Quality Status Pie Chart - Row 1, Col 2 */}
        <div className="dashboard-widget chart-widget-right chart-widget-row-1">
          <div className="widget-header">
            <h3>Quality Status</h3>
          </div>
          <div className="widget-content">
            {qualityStatus && qualityStatus.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={qualityStatus}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(props: any) => {
                      const { status, count } = qualityStatus[props.index] || {};
                      return `${status}: ${count}`;
                    }}
                    outerRadius={90}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {qualityStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="widget-empty">No quality data available</div>
            )}
          </div>
        </div>

        {/* Revenue & Expenses Trend - Row 2, Col 1 */}
        <div className="dashboard-widget chart-widget-left chart-widget-row-2">
          <div className="widget-header">
            <h3>Revenue & Expenses Trend</h3>
            <select
              className="widget-period-select"
              value={revenuePeriod}
              onChange={(e) => setRevenuePeriod(e.target.value)}
            >
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="90days">Last 90 Days</option>
            </select>
          </div>
          <div className="widget-content">
            {revenueTrends && revenueTrends.revenue.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={revenueTrends.revenue.map((r, i) => ({
                  date: r.date,
                  revenue: r.revenue,
                  expenses: revenueTrends.expenses.find(e => e.date === r.date)?.expenses || 0
                }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip formatter={(value: any) => formatCurrency(typeof value === 'number' ? value : 0)} />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} name="Revenue" />
                  <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} name="Expenses" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="widget-empty">No revenue data available</div>
            )}
          </div>
        </div>

        {/* Top Customers - Row 2, Col 2 */}
        <div className="dashboard-widget chart-widget-right chart-widget-row-2">
          <div className="widget-header">
            <h3>Top Customers</h3>
          </div>
          <div className="widget-content">
            {topCustomers.length > 0 ? (
              <div className="top-list">
                {topCustomers.map((customer, index) => (
                  <div key={customer.customerId} className="top-list-item">
                    <div className="top-list-rank">{index + 1}</div>
                    <div className="top-list-info">
                      <div className="top-list-name">{customer.customerName}</div>
                      <div className="top-list-detail">{formatCurrency(customer.revenue)} • {customer.orderCount} orders</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="widget-empty">No customer data available</div>
            )}
          </div>
        </div>

        {/* Top Products - Row 3, Col 2 */}
        <div className="dashboard-widget chart-widget-right chart-widget-row-3">
          <div className="widget-header">
            <h3>Top Products</h3>
          </div>
          <div className="widget-content">
            {topProducts.length > 0 ? (
              <div className="top-list">
                {topProducts.map((product, index) => (
                  <div key={product.partNo} className="top-list-item">
                    <div className="top-list-rank">{index + 1}</div>
                    <div className="top-list-info">
                      <div className="top-list-name">{product.partName || product.partNo}</div>
                      <div className="top-list-detail">{formatCurrency(product.revenue)} • Qty: {product.quantity}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="widget-empty">No product data available</div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="dashboard-bottom">
        {/* Recent Activities - Row 1, Col 1 */}
        <div className="dashboard-widget bottom-widget-left bottom-widget-row-1">
          <div className="widget-header">
            <h3>Recent Activities</h3>
            <button className="widget-filter-btn">
              <FontAwesomeIcon icon={faFilter} />
            </button>
          </div>
          <div className="widget-content">
            {recentActivities.length > 0 ? (
              <div className="activity-feed">
                {recentActivities.map((activity, index) => (
                  <div key={index} className="activity-item" onClick={() => handleNavigate(activity.entityType, activity.entityId)}>
                    <div className="activity-icon" style={{ backgroundColor: `${getActivityColor(activity.type)}20`, color: getActivityColor(activity.type) }}>
                      <FontAwesomeIcon icon={getActivityIcon(activity.type)} />
                    </div>
                    <div className="activity-content">
                      <div className="activity-description">{activity.description}</div>
                      <div className="activity-time">{formatDate(activity.timestamp)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="widget-empty">No recent activities</div>
            )}
          </div>
        </div>

        {/* Quick Actions - Row 1, Col 2 */}
        <div className="dashboard-widget bottom-widget-right bottom-widget-row-1">
          <div className="widget-header">
            <h3>Quick Actions</h3>
          </div>
          <div className="widget-content">
            <div className="quick-actions-grid">
              <button className="quick-action-btn" onClick={() => history.push("/job-orders")}>
                <FontAwesomeIcon icon={faPlus} />
                <span>Create Job Order</span>
              </button>
              <button className="quick-action-btn" onClick={() => history.push("/orders/customer")}>
                <FontAwesomeIcon icon={faPlus} />
                <span>Create Customer Order</span>
              </button>
              <button className="quick-action-btn" onClick={() => history.push("/purchasing/vendor-orders")}>
                <FontAwesomeIcon icon={faPlus} />
                <span>Create Vendor Order</span>
              </button>
              <button className="quick-action-btn" onClick={() => history.push("/quality")}>
                <FontAwesomeIcon icon={faPlus} />
                <span>Create NCR</span>
              </button>
              <button className="quick-action-btn" onClick={() => history.push("/reports")}>
                <FontAwesomeIcon icon={faChartBar} />
                <span>Generate Report</span>
              </button>
              <button className="quick-action-btn" onClick={() => history.push("/documents")}>
                <FontAwesomeIcon icon={faBox} />
                <span>View Documents</span>
              </button>
            </div>
          </div>
        </div>

        {/* Alerts - Row 2, Col 1 */}
        <div className="dashboard-widget bottom-widget-left bottom-widget-row-2">
          <div className="widget-header">
            <h3>Alerts & Notifications</h3>
            <span className="alert-badge">{alerts.length}</span>
          </div>
          <div className="widget-content">
            {alerts.length > 0 ? (
              <div className="alerts-list">
                {alerts.slice(0, 10).map((alert, index) => (
                  <div
                    key={index}
                    className="alert-item"
                    style={{ borderLeftColor: getPriorityColor(alert.priority) }}
                    onClick={() => handleNavigate(alert.entityType, alert.entityId)}
                  >
                    <div className="alert-icon">
                      <FontAwesomeIcon icon={faExclamationTriangle} style={{ color: getPriorityColor(alert.priority) }} />
                    </div>
                    <div className="alert-content">
                      <div className="alert-title">{alert.title}</div>
                      <div className="alert-description">{alert.description}</div>
                    </div>
                    <div className="alert-priority" style={{ backgroundColor: `${getPriorityColor(alert.priority)}20`, color: getPriorityColor(alert.priority) }}>
                      {alert.priority}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="widget-empty">No alerts</div>
            )}
          </div>
        </div>

        {/* Upcoming Deadlines - Row 2, Col 2 */}
        <div className="dashboard-widget bottom-widget-right bottom-widget-row-2">
          {(() => {
            const filteredDeadlines = upcomingDeadlines.filter(
              (d: any) => !d.isVoided && d.status !== 'Void' && d.status !== 'Voided'
            );
            return (
              <>
                <div className="widget-header">
                  <h3>Upcoming Deadlines</h3>
                  <span className="deadline-badge">{filteredDeadlines.length}</span>
                </div>
                <div className="widget-content">
                  {filteredDeadlines.length > 0 ? (
                    <div className="deadlines-list">
                      {filteredDeadlines.slice(0, 7).map((deadline, index) => (
                        <div
                          key={index}
                          className="deadline-item"
                          onClick={() => handleNavigate(deadline.entityType, deadline.entityId)}
                        >
                          <div className="deadline-icon">
                            <FontAwesomeIcon icon={faCalendar} />
                          </div>
                          <div className="deadline-content">
                            <div className="deadline-title">{deadline.title}</div>
                            <div className="deadline-description">{deadline.description}</div>
                            <div className="deadline-date">
                              Due: {new Date(deadline.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="widget-empty">No upcoming deadlines</div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

