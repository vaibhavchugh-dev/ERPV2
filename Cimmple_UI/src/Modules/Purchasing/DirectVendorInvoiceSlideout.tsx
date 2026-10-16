import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
  VendorInvoiceService,
  CreateDirectVendorInvoiceRequest,
} from "../../Common/Services/VendorInvoiceService";
import { VendorService } from "../../Common/Services/VendorService";
import { ChartofAccountsService } from "../../Common/Services/ChartofAccountsService";
import { AccountingService } from "../../Common/Services/AccountingService";
import { useFormatting } from "../../Common/Hooks/useFormatting";
import { useActiveLocation } from "../../Common/Hooks/useActiveLocation";
import { todayIsoInTenantTimezone } from "../../Common/Utils/Formatting";
import { confirmDiscardChanges, onBackdropClick } from "../../Common/Utils/dismissGuard";
import "../../Common/Components/MasterSlideout/MasterSlideout.scss";
import "./DirectVendorInvoiceSlideout.scss";

interface PaymentTermOption {
  id: number;
  name: string;
  days: number;
  isActive?: boolean;
}

interface CoaOption {
  accountID: number;
  accountCode: string;
  accountName: string;
  accountType: string;
}

interface LineDraft {
  key: string;
  description: string;
  amount: string;
  accountId: number;
}

interface DirectVendorInvoiceSlideoutProps {
  onClose: (refreshList?: boolean) => void;
}

const addDaysToIsoDate = (isoDate: string, days: number): string => {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const newLineKey = () => `L-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const emptyLine = (accountId = 0): LineDraft => ({
  key: newLineKey(),
  description: "",
  amount: "",
  accountId,
});

const DirectVendorInvoiceSlideout: React.FC<DirectVendorInvoiceSlideoutProps> = ({
  onClose,
}) => {
  const { formatCurrency } = useFormatting();
  const { locationId: activeLocationId } = useActiveLocation();

  const [vendors, setVendors] = useState<
    Array<{ vendor_id: number; company_name: string; vendorcode: string }>
  >([]);
  const [coaAccounts, setCoaAccounts] = useState<CoaOption[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTermOption[]>([]);
  const [defaultExpenseAccountId, setDefaultExpenseAccountId] = useState(0);

  const [vendorId, setVendorId] = useState(0);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => todayIsoInTenantTimezone());
  const [dueDate, setDueDate] = useState(() =>
    addDaysToIsoDate(todayIsoInTenantTimezone(), 30)
  );
  const [paymentTermId, setPaymentTermId] = useState(0);
  const [notes, setNotes] = useState("");
  const [taxRate, setTaxRate] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [taxAmountManual, setTaxAmountManual] = useState(false);
  const [freightCharge, setFreightCharge] = useState(0);
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const markDirty = () => setIsDirty(true);

  const handleDismiss = () => {
    if (loading) return;
    if (confirmDiscardChanges(isDirty)) onClose(false);
  };

  useEffect(() => {
    const bootstrap = async () => {
      setBootstrapping(true);
      try {
        const storage = JSON.parse(localStorage.getItem("storage") || "{}");
        const tenantID = storage?.tenantID || 0;
        const [vendorList, accounts, settings] = await Promise.all([
          VendorService.GetVendorlist({ tenantid: tenantID }),
          ChartofAccountsService.GetChartofAccounts({ tenantid: tenantID }),
          AccountingService.GetAccountingSettings(),
        ]);

        if (Array.isArray(vendorList)) {
          setVendors(
            vendorList
              .filter((v: any) => (v.status || "Active").toLowerCase() !== "inactive")
              .map((v: any) => ({
                vendor_id: v.vendor_id,
                company_name: v.company_name || "",
                vendorcode: v.vendorcode || "",
              }))
          );
        }

        const activeAccounts = (accounts || []).filter((a) => a.isActive !== false);
        setCoaAccounts(
          activeAccounts.map((a) => ({
            accountID: a.accountID,
            accountCode: a.accountCode || "",
            accountName: a.accountName || "",
            accountType: a.accountType || "",
          }))
        );

        const companyExpenseId = Number(settings?.defaultExpenseAccountId) || 0;
        setDefaultExpenseAccountId(companyExpenseId);
        setLines([emptyLine(companyExpenseId)]);

        const rate = Number(settings?.taxRate) || 0;
        setTaxRate(rate);

        const terms: PaymentTermOption[] = (settings?.paymentTerms || [])
          .filter((t: any) => t.isActive !== false)
          .map((t: any) => ({
            id: Number(t.id) || 0,
            name: t.name || "",
            days: Number(t.days) || 0,
            isActive: t.isActive !== false,
          }))
          .filter((t: PaymentTermOption) => t.id > 0);
        setPaymentTerms(terms);
      } catch (error) {
        console.error("Error loading direct invoice form data:", error);
        toast.error("Failed to load form data");
      } finally {
        setBootstrapping(false);
      }
    };
    bootstrap();
  }, []);

  const expenseAccounts = useMemo(() => {
    const expenseLike = coaAccounts.filter((a) => {
      const t = (a.accountType || "").toLowerCase();
      return (
        t.includes("expense") ||
        t.includes("cost of") ||
        t.includes("cogs") ||
        t.includes("overhead")
      );
    });
    return expenseLike.length > 0 ? expenseLike : coaAccounts;
  }, [coaAccounts]);

  const subtotal = useMemo(() => {
    return Math.round(
      lines.reduce((sum, line) => {
        const n = parseFloat(line.amount);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0) * 100
    ) / 100;
  }, [lines]);

  useEffect(() => {
    if (taxAmountManual) return;
    const computed = Math.round(subtotal * (taxRate / 100) * 100) / 100;
    setTaxAmount(computed);
  }, [subtotal, taxRate, taxAmountManual]);

  const invoiceTotal = useMemo(() => {
    return Math.round((subtotal + taxAmount + (freightCharge || 0)) * 100) / 100;
  }, [subtotal, taxAmount, freightCharge]);

  const applyPaymentTerm = (termId: number, fromInvoiceDate = invoiceDate) => {
    setPaymentTermId(termId);
    if (termId <= 0) return;
    const term = paymentTerms.find((t) => t.id === termId);
    if (term) {
      setDueDate(addDaysToIsoDate(fromInvoiceDate, term.days));
    }
  };

  const handleVendorChange = async (nextVendorId: number) => {
    markDirty();
    setVendorId(nextVendorId);
    setErrors((prev) => ({ ...prev, vendorId: "" }));

    if (nextVendorId <= 0) return;

    try {
      const vendor = await VendorService.GetVendorById(nextVendorId);
      if (!vendor) return;

      const expenseId =
        Number((vendor as any).defaultExpenseAccountId) || defaultExpenseAccountId || 0;
      if (expenseId > 0) {
        setLines((prev) =>
          prev.map((line) =>
            line.accountId === 0 || line.accountId === defaultExpenseAccountId
              ? { ...line, accountId: expenseId }
              : line
          )
        );
      }

      const vendorTerm = ((vendor as any).term || "").trim();
      if (vendorTerm && paymentTerms.length > 0) {
        const match =
          paymentTerms.find(
            (t) => t.name.toLowerCase() === vendorTerm.toLowerCase()
          ) ||
          paymentTerms.find((t) =>
            vendorTerm.toUpperCase().includes(`NET${t.days}`)
          ) ||
          paymentTerms.find((t) => vendorTerm.includes(String(t.days)));
        if (match) {
          applyPaymentTerm(match.id);
        }
      }
    } catch (error) {
      console.error("Error loading vendor defaults:", error);
    }
  };

  const updateLine = (key: string, field: keyof LineDraft, value: string | number) => {
    markDirty();
    setLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, [field]: value } : line))
    );
  };

  const addLine = () => {
    markDirty();
    const fallbackAccount =
      lines[0]?.accountId || defaultExpenseAccountId || expenseAccounts[0]?.accountID || 0;
    setLines((prev) => [...prev, emptyLine(fallbackAccount)]);
  };

  const removeLine = (key: string) => {
    markDirty();
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (vendorId <= 0) next.vendorId = "Vendor is required";
    if (!invoiceDate) next.invoiceDate = "Invoice date is required";
    if (!dueDate) next.dueDate = "Due date is required";
    if (invoiceDate && dueDate && dueDate < invoiceDate) {
      next.dueDate = "Due date cannot be before invoice date";
    }

    const validLines = lines.filter(
      (l) => l.description.trim() || (parseFloat(l.amount) || 0) > 0
    );
    if (validLines.length === 0) {
      next.lines = "Add at least one line with description and amount";
    } else {
      for (const line of validLines) {
        if (!line.description.trim()) {
          next.lines = "Each line requires a description";
          break;
        }
        const amt = parseFloat(line.amount);
        if (!Number.isFinite(amt) || amt <= 0) {
          next.lines = "Each line amount must be greater than zero";
          break;
        }
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      toast.error("Please fix the highlighted fields");
      return;
    }

    const selectedVendor = vendors.find((v) => v.vendor_id === vendorId);
    const lineItems = lines
      .filter((l) => l.description.trim() && (parseFloat(l.amount) || 0) > 0)
      .map((l) => {
        const amount = Math.round(parseFloat(l.amount) * 100) / 100;
        return {
          description: l.description.trim(),
          amount,
          accountId: l.accountId > 0 ? l.accountId : undefined,
          quantity: 1,
          unitPrice: amount,
        };
      });

    const request: CreateDirectVendorInvoiceRequest = {
      vendorId,
      vendorCode: selectedVendor?.vendorcode,
      vendorName: selectedVendor?.company_name,
      invoiceNo: invoiceNo.trim() || undefined,
      locationId: activeLocationId > 0 ? activeLocationId : undefined,
      invoiceDate,
      dueDate,
      paymentTermId: paymentTermId > 0 ? paymentTermId : undefined,
      notes: notes.trim() || undefined,
      taxRate,
      taxAmount,
      freightCharge: freightCharge || 0,
      lineItems,
    };

    setLoading(true);
    try {
      const result = await VendorInvoiceService.CreateDirectVendorInvoice(request);
      if (result) {
        toast.success(
          result.message ||
            `Vendor invoice ${result.invoiceNumber} created and posted to AP`
        );
        onClose(true);
      } else {
        toast.error("Failed to create vendor invoice");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to create vendor invoice");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="slideout-overlay" onClick={onBackdropClick(handleDismiss)}>
      <div
        className="form-card direct-vendor-invoice-slideout"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="form-header">
          <div>
            <h2>Add Vendor Invoice</h2>
            <p className="direct-bill-subtitle">
              Direct bill — no purchase order. For PO billing, open the vendor order and
              use Create Invoice.
            </p>
          </div>
          <button type="button" className="btn-close" onClick={handleDismiss} aria-label="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {bootstrapping ? (
          <div className="page-loading" style={{ minHeight: 280 }}>
            <div className="loading-spinner" />
            <p>Loading…</p>
          </div>
        ) : (
          <form className="airframe-form" onSubmit={handleSubmit}>
            <div className="tab-content" style={{ display: "block" }}>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="directVendor">
                    Vendor <span className="required">*</span>
                  </label>
                  <select
                    id="directVendor"
                    className={`form-input ${errors.vendorId ? "error" : ""}`}
                    value={vendorId || ""}
                    onChange={(e) => handleVendorChange(Number(e.target.value) || 0)}
                  >
                    <option value="">Select vendor…</option>
                    {vendors.map((v) => (
                      <option key={v.vendor_id} value={v.vendor_id}>
                        {v.company_name}
                        {v.vendorcode ? ` (${v.vendorcode})` : ""}
                      </option>
                    ))}
                  </select>
                  {errors.vendorId && (
                    <span className="error-message">{errors.vendorId}</span>
                  )}
                </div>
                <div className="form-group">
                  <label htmlFor="directInvoiceNo">Vendor Invoice #</label>
                  <input
                    id="directInvoiceNo"
                    type="text"
                    className="form-input"
                    placeholder="Optional — vendor's bill number"
                    value={invoiceNo}
                    onChange={(e) => {
                      markDirty();
                      setInvoiceNo(e.target.value);
                    }}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="directInvoiceDate">
                    Invoice Date <span className="required">*</span>
                  </label>
                  <input
                    id="directInvoiceDate"
                    type="date"
                    className={`form-input ${errors.invoiceDate ? "error" : ""}`}
                    value={invoiceDate}
                    onChange={(e) => {
                      markDirty();
                      const next = e.target.value;
                      setInvoiceDate(next);
                      if (paymentTermId > 0) applyPaymentTerm(paymentTermId, next);
                      setErrors((prev) => ({ ...prev, invoiceDate: "" }));
                    }}
                  />
                  {errors.invoiceDate && (
                    <span className="error-message">{errors.invoiceDate}</span>
                  )}
                </div>
                <div className="form-group">
                  <label htmlFor="directPaymentTerm">Payment Term</label>
                  <select
                    id="directPaymentTerm"
                    className="form-input"
                    value={paymentTermId || ""}
                    onChange={(e) => {
                      markDirty();
                      applyPaymentTerm(Number(e.target.value) || 0);
                    }}
                  >
                    <option value="">Custom due date</option>
                    {paymentTerms.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.days} days)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="directDueDate">
                    Due Date <span className="required">*</span>
                  </label>
                  <input
                    id="directDueDate"
                    type="date"
                    className={`form-input ${errors.dueDate ? "error" : ""}`}
                    value={dueDate}
                    onChange={(e) => {
                      markDirty();
                      setDueDate(e.target.value);
                      setPaymentTermId(0);
                      setErrors((prev) => ({ ...prev, dueDate: "" }));
                    }}
                  />
                  {errors.dueDate && (
                    <span className="error-message">{errors.dueDate}</span>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="directNotes">Notes</label>
                <textarea
                  id="directNotes"
                  className="form-input"
                  rows={2}
                  placeholder="Optional memo (e.g. March electricity)"
                  value={notes}
                  onChange={(e) => {
                    markDirty();
                    setNotes(e.target.value);
                  }}
                />
              </div>

              <div className="direct-lines-header">
                <h3>Line Items</h3>
                <button type="button" className="btn-add-line" onClick={addLine}>
                  + Add line
                </button>
              </div>
              {errors.lines && <span className="error-message">{errors.lines}</span>}

              <div className="direct-lines-table-wrap">
                <table className="direct-lines-table">
                  <thead>
                    <tr>
                      <th style={{ width: "46%" }}>Description</th>
                      <th style={{ width: "34%" }}>Expense Account</th>
                      <th style={{ width: "14%" }}>Amount</th>
                      <th style={{ width: "6%" }} />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.key}>
                        <td>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="e.g. Electricity — March 2026"
                            value={line.description}
                            onChange={(e) =>
                              updateLine(line.key, "description", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <select
                            className="form-input"
                            value={line.accountId || ""}
                            onChange={(e) =>
                              updateLine(
                                line.key,
                                "accountId",
                                Number(e.target.value) || 0
                              )
                            }
                          >
                            <option value="">Default expense</option>
                            {expenseAccounts.map((a) => (
                              <option key={a.accountID} value={a.accountID}>
                                {a.accountCode} — {a.accountName}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            className="form-input amount-input"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={line.amount}
                            onChange={(e) =>
                              updateLine(line.key, "amount", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-remove-line"
                            title="Remove line"
                            disabled={lines.length <= 1}
                            onClick={() => removeLine(line.key)}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="direct-totals">
                <div className="direct-totals-fields">
                  <div className="form-group">
                    <label htmlFor="directTaxRate">Tax Rate %</label>
                    <input
                      id="directTaxRate"
                      type="number"
                      className="form-input"
                      min="0"
                      max="100"
                      step="0.01"
                      value={taxRate}
                      onChange={(e) => {
                        markDirty();
                        setTaxAmountManual(false);
                        setTaxRate(parseFloat(e.target.value) || 0);
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="directTaxAmount">Tax Amount</label>
                    <input
                      id="directTaxAmount"
                      type="number"
                      className="form-input"
                      min="0"
                      step="0.01"
                      value={taxAmount}
                      onChange={(e) => {
                        markDirty();
                        setTaxAmountManual(true);
                        setTaxAmount(parseFloat(e.target.value) || 0);
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="directFreight">Freight</label>
                    <input
                      id="directFreight"
                      type="number"
                      className="form-input"
                      min="0"
                      step="0.01"
                      value={freightCharge}
                      onChange={(e) => {
                        markDirty();
                        setFreightCharge(parseFloat(e.target.value) || 0);
                      }}
                    />
                  </div>
                </div>
                <div className="direct-totals-summary">
                  <div>
                    <span>Subtotal</span>
                    <strong>{formatCurrency(subtotal)}</strong>
                  </div>
                  <div>
                    <span>Tax</span>
                    <strong>{formatCurrency(taxAmount)}</strong>
                  </div>
                  <div>
                    <span>Freight</span>
                    <strong>{formatCurrency(freightCharge || 0)}</strong>
                  </div>
                  <div className="direct-total-row">
                    <span>Total (AP)</span>
                    <strong>{formatCurrency(invoiceTotal)}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="form-actions">
              <button type="button" className="btn-cancel" onClick={handleDismiss} disabled={loading}>
                Cancel
              </button>
              <button type="submit" className="btn-submit" disabled={loading}>
                {loading ? "Saving…" : "Create Invoice"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default DirectVendorInvoiceSlideout;
