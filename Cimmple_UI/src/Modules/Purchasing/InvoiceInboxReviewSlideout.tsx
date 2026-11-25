import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { InvoiceInboxItemDetail, InvoiceInboxService } from "../../Common/Services/InvoiceInboxService";
import {
  VendorInvoiceService,
  CreateDirectVendorInvoiceRequest,
} from "../../Common/Services/VendorInvoiceService";
import { VendorService } from "../../Common/Services/VendorService";
import { ChartofAccountsService } from "../../Common/Services/ChartofAccountsService";
import { AccountingService } from "../../Common/Services/AccountingService";
import {
  applyDirectVendorInvoiceImport,
  buildVendorInvoiceReview,
  type ExtractedVendorDraft,
  type VendorQuotationExtractionResult,
} from "../../Common/DocumentExtraction";
import { useFormatting } from "../../Common/Hooks/useFormatting";
import { usePagePermissions } from "../../Common/Hooks/usePagePermissions";
import { todayIsoInTenantTimezone } from "../../Common/Utils/Formatting";
import { confirmDiscardChanges, onBackdropClick } from "../../Common/Utils/dismissGuard";
import "../../Common/Components/MasterSlideout/MasterSlideout.scss";
import "./DirectVendorInvoiceSlideout.scss";
import "./InvoiceInboxReviewSlideout.scss";

const VendorMasterSlideout = lazy(() => import("../Masters/VendorMasterSlideout"));

const PAGE_PATH = "/purchasing/invoice-inbox";

interface PaymentTermOption {
  id: number;
  name: string;
  days: number;
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

interface InvoiceInboxReviewSlideoutProps {
  itemId: number;
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

const InvoiceInboxReviewSlideout: React.FC<InvoiceInboxReviewSlideoutProps> = ({
  itemId,
  onClose,
}) => {
  const history = useHistory();
  const { formatCurrency, formatUtcToTimezone } = useFormatting();
  const { canAdd, canDelete } = usePagePermissions(PAGE_PATH);
  const { canAdd: canAddVendor } = usePagePermissions("/masters/vendor");

  const [item, setItem] = useState<InvoiceInboxItemDetail | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<"pdf" | "email">("pdf");
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
  const [extractedTotal, setExtractedTotal] = useState<number | null>(null);

  const [unmatchedVendorDraft, setUnmatchedVendorDraft] =
    useState<ExtractedVendorDraft | null>(null);
  const [unmatchedVendorHint, setUnmatchedVendorHint] = useState("");
  const [showCreateVendor, setShowCreateVendor] = useState(false);

  const [bootstrapping, setBootstrapping] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const markDirty = () => setIsDirty(true);

  const readOnly = item?.status === "Converted" || item?.status === "Discarded";

  const loadVendors = useCallback(async () => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const list = await VendorService.GetVendorlist({ tenantid: storage?.tenantID || 0 });
    const mapped = (Array.isArray(list) ? list : [])
      .filter((v: any) => (v.status || "Active").toLowerCase() !== "inactive")
      .map((v: any) => ({
        vendor_id: v.vendor_id,
        company_name: v.company_name || "",
        vendorcode: v.vendorcode || "",
      }));
    setVendors(mapped);
    return mapped;
  }, []);

  /** Vendor defaults (expense account, payment term) — same rules as the manual bill form. */
  const applyVendorDefaults = useCallback(
    async (
      nextVendorId: number,
      terms: PaymentTermOption[],
      companyExpenseId: number,
      options?: { preserveDueDate?: boolean; fromInvoiceDate?: string }
    ): Promise<number> => {
      if (nextVendorId <= 0) return companyExpenseId;
      try {
        const vendor = await VendorService.GetVendorById(nextVendorId);
        if (!vendor) return companyExpenseId;

        const expenseId = Number((vendor as any).defaultExpenseAccountId) || companyExpenseId || 0;
        if (expenseId > 0) {
          setLines((prev) =>
            prev.map((line) =>
              line.accountId === 0 || line.accountId === companyExpenseId
                ? { ...line, accountId: expenseId }
                : line
            )
          );
        }

        if (!options?.preserveDueDate) {
          const vendorTerm = ((vendor as any).term || "").trim();
          if (vendorTerm && terms.length > 0) {
            const match =
              terms.find((t) => t.name.toLowerCase() === vendorTerm.toLowerCase()) ||
              terms.find((t) => vendorTerm.toUpperCase().includes(`NET${t.days}`)) ||
              terms.find((t) => vendorTerm.includes(String(t.days)));
            if (match) {
              setPaymentTermId(match.id);
              setDueDate(
                addDaysToIsoDate(options?.fromInvoiceDate || todayIsoInTenantTimezone(), match.days)
              );
            }
          }
        }
        return expenseId;
      } catch (error) {
        console.error("Error loading vendor defaults:", error);
        return companyExpenseId;
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    const bootstrap = async () => {
      setBootstrapping(true);
      setLoadError("");
      try {
        const storage = JSON.parse(localStorage.getItem("storage") || "{}");
        const tenantID = storage?.tenantID || 0;

        const detail = await InvoiceInboxService.GetItem(itemId);
        if (cancelled) return;
        setItem(detail);
        if (!detail.hasFile) setLeftTab("email");

        if (detail.hasFile) {
          InvoiceInboxService.GetFile(itemId)
            .then((blob) => {
              if (cancelled) return;
              objectUrl = URL.createObjectURL(blob);
              setPdfUrl(objectUrl);
            })
            .catch(() => {
              if (!cancelled) toast.error("Could not load the PDF preview");
            });
        }

        const isOpen = detail.status !== "Converted" && detail.status !== "Discarded";
        if (!isOpen) return;

        const [vendorList, accounts, settings] = await Promise.all([
          loadVendors(),
          ChartofAccountsService.GetChartofAccounts({ tenantid: tenantID }),
          AccountingService.GetAccountingSettings(),
        ]);
        if (cancelled) return;

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
        const rate = Number(settings?.taxRate) || 0;
        setTaxRate(rate);

        const terms: PaymentTermOption[] = (settings?.paymentTerms || [])
          .filter((t: any) => t.isActive !== false)
          .map((t: any) => ({
            id: Number(t.id) || 0,
            name: t.name || "",
            days: Number(t.days) || 0,
          }))
          .filter((t: PaymentTermOption) => t.id > 0);
        setPaymentTerms(terms);

        // Prefill the bill from what the extraction service read off the PDF.
        let startLines: LineDraft[] = [emptyLine(companyExpenseId)];
        if (detail.extractionJson) {
          try {
            const result = JSON.parse(detail.extractionJson) as VendorQuotationExtractionResult;
            const review = buildVendorInvoiceReview(result, vendorList);
            const mapped = applyDirectVendorInvoiceImport({
              currentLines: [],
              review,
              mode: "override",
              defaultAccountId: companyExpenseId,
              newLineKey,
            });

            startLines = mapped.lines;
            if (mapped.invoiceNo) setInvoiceNo(mapped.invoiceNo);
            const effectiveInvoiceDate = mapped.invoiceDate || todayIsoInTenantTimezone();
            if (mapped.invoiceDate) setInvoiceDate(mapped.invoiceDate);
            if (mapped.dueDate) {
              setDueDate(mapped.dueDate);
            } else {
              setDueDate(addDaysToIsoDate(effectiveInvoiceDate, 30));
            }
            if (mapped.taxRate !== undefined) setTaxRate(mapped.taxRate);
            if (mapped.hasExtractedTax && mapped.taxAmount !== undefined) {
              setTaxAmountManual(true);
              setTaxAmount(mapped.taxAmount);
            }
            if (mapped.freightCharge !== undefined) setFreightCharge(mapped.freightCharge);
            setExtractedTotal(mapped.extractedTotal);

            if (review.matchedVendorId > 0) {
              setVendorId(review.matchedVendorId);
              const vendorExpenseId = await applyVendorDefaults(
                review.matchedVendorId,
                terms,
                companyExpenseId,
                {
                  preserveDueDate: Boolean(mapped.dueDate),
                  fromInvoiceDate: effectiveInvoiceDate,
                }
              );
              if (vendorExpenseId > 0) {
                startLines = startLines.map((line) =>
                  line.accountId === 0 || line.accountId === companyExpenseId
                    ? { ...line, accountId: vendorExpenseId }
                    : line
                );
              }
            } else if (review.extractedVendorDraft || review.vendorNameHint) {
              setUnmatchedVendorDraft(
                review.extractedVendorDraft || {
                  company_name: review.vendorNameHint.split(",")[0]?.trim() || "",
                  email: "",
                  phone_number: "",
                  address: "",
                  apartment: "",
                  City: "",
                  states: "",
                  zipcode: "",
                  country: "US",
                  shippingaddress: "",
                  shippingApartment: "",
                  shippingCity: "",
                  shippingStates: "",
                  shippingZipCode: "",
                  shippingCountry: "",
                  contactFirstName: "",
                  contactLastName: "",
                  contactEmail: "",
                  contactPhone: "",
                }
              );
              setUnmatchedVendorHint(review.vendorNameHint || detail.extractedVendorName || "");
            }
          } catch (error) {
            console.error("Could not read the stored extraction:", error);
            toast.info("The extracted data could not be read. Enter the bill details manually.");
          }
        }
        if (!cancelled) setLines(startLines);
      } catch (error: any) {
        if (!cancelled) setLoadError(error?.message || "Failed to load this inbox item");
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [itemId, loadVendors, applyVendorDefaults]);

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

  const subtotal = useMemo(
    () =>
      Math.round(
        lines.reduce((sum, line) => {
          const n = parseFloat(line.amount);
          return sum + (Number.isFinite(n) ? n : 0);
        }, 0) * 100
      ) / 100,
    [lines]
  );

  useEffect(() => {
    if (taxAmountManual) return;
    setTaxAmount(Math.round(subtotal * (taxRate / 100) * 100) / 100);
  }, [subtotal, taxRate, taxAmountManual]);

  const invoiceTotal = useMemo(
    () => Math.round((subtotal + taxAmount + (freightCharge || 0)) * 100) / 100,
    [subtotal, taxAmount, freightCharge]
  );

  const applyPaymentTerm = (termId: number, fromInvoiceDate = invoiceDate) => {
    setPaymentTermId(termId);
    if (termId <= 0) return;
    const term = paymentTerms.find((t) => t.id === termId);
    if (term) setDueDate(addDaysToIsoDate(fromInvoiceDate, term.days));
  };

  const handleVendorChange = async (nextVendorId: number) => {
    markDirty();
    setVendorId(nextVendorId);
    setErrors((prev) => ({ ...prev, vendorId: "" }));
    if (nextVendorId > 0) {
      setUnmatchedVendorDraft(null);
      setUnmatchedVendorHint("");
    }
    await applyVendorDefaults(nextVendorId, paymentTerms, defaultExpenseAccountId, {
      fromInvoiceDate: invoiceDate,
    });
  };

  const updateLine = (key: string, field: keyof LineDraft, value: string | number) => {
    markDirty();
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, [field]: value } : line)));
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

    const validLines = lines.filter((l) => l.description.trim() || (parseFloat(l.amount) || 0) > 0);
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

  const handleDismiss = () => {
    if (saving || busyAction) return;
    if (confirmDiscardChanges(isDirty)) onClose(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item || saving || readOnly || !canAdd) return;
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
      // The bill belongs to the site whose inbox address received it.
      locationId: item.locationId > 0 ? item.locationId : undefined,
      invoiceDate,
      dueDate,
      paymentTermId: paymentTermId > 0 ? paymentTermId : undefined,
      notes: notes.trim() || undefined,
      taxRate,
      taxAmount,
      freightCharge: freightCharge || 0,
      lineItems,
    };

    setSaving(true);
    let created: { id: number; invoiceNumber: string; message: string } | null = null;
    try {
      created = await VendorInvoiceService.CreateDirectVendorInvoice(request);
      if (!created) {
        toast.error("Failed to create vendor invoice");
        setSaving(false);
        return;
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to create vendor invoice");
      setSaving(false);
      return;
    }

    try {
      await InvoiceInboxService.MarkConverted(item.id, created.id);
      toast.success(
        created.message || `Vendor invoice ${created.invoiceNumber} created and posted to AP`
      );
    } catch (error: any) {
      // The bill exists; only the inbox link failed. Do not invite a duplicate attempt.
      toast.warning(
        `Vendor invoice ${created.invoiceNumber} was created, but the inbox item could not be marked converted. ${
          error?.message || ""
        }`.trim()
      );
    }
    setSaving(false);
    onClose(true);
  };

  const handleRetry = async () => {
    if (!item || busyAction) return;
    setBusyAction(true);
    try {
      await InvoiceInboxService.Retry(item.id);
      toast.success("Queued for extraction. The list will update shortly.");
      onClose(true);
    } catch (error: any) {
      toast.error(error.message || "Failed to retry extraction");
    } finally {
      setBusyAction(false);
    }
  };

  const handleDiscard = async () => {
    if (!item || busyAction) return;
    if (!window.confirm("Discard this email? It will be removed from the inbox queue.")) return;
    setBusyAction(true);
    try {
      await InvoiceInboxService.Discard(item.id);
      toast.success("Discarded");
      onClose(true);
    } catch (error: any) {
      toast.error(error.message || "Failed to discard the item");
    } finally {
      setBusyAction(false);
    }
  };

  const fromLabel = item
    ? item.fromName
      ? `${item.fromName}${item.fromEmail ? ` <${item.fromEmail}>` : ""}`
      : item.fromEmail || "Unknown sender"
    : "";

  const statusNotice = (() => {
    if (!item || readOnly) return null;
    if (item.status === "Failed") {
      return {
        tone: "danger",
        text: `Extraction failed: ${item.failureReason || "unknown error"}. You can retry, or enter the bill manually.`,
      };
    }
    if (item.status === "New" || item.status === "Extracting") {
      return {
        tone: "info",
        text: "This PDF is still being read. Close and reopen in a moment to get the prefilled bill, or enter it manually.",
      };
    }
    if (item.status === "NoAttachment") {
      return {
        tone: "warning",
        text: "This email had no PDF attachment. You can still enter the bill manually from the email text.",
      };
    }
    return null;
  })();

  return (
    <div className="slideout-overlay" onClick={onBackdropClick(handleDismiss)}>
      <div
        className="form-card direct-vendor-invoice-slideout invoice-inbox-review"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="form-header">
          <div>
            <h2>Review Inbox Invoice</h2>
            {item && (
              <p className="direct-bill-subtitle">
                From {fromLabel}
                {item.receivedUtc ? ` · received ${formatUtcToTimezone(item.receivedUtc)}` : ""}
              </p>
            )}
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
        ) : loadError ? (
          <div className="inbox-review-error" role="alert">
            <p>{loadError}</p>
            <button type="button" className="btn-cancel" onClick={() => onClose(false)}>
              Close
            </button>
          </div>
        ) : (
          <form className="airframe-form" onSubmit={handleSubmit}>
            <div className="inbox-review-grid">
              <div className="inbox-review-left">
                <div className="inbox-review-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={leftTab === "pdf"}
                    className={leftTab === "pdf" ? "active" : ""}
                    disabled={!item?.hasFile}
                    onClick={() => setLeftTab("pdf")}
                  >
                    PDF{item?.fileName ? ` — ${item.fileName}` : ""}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={leftTab === "email"}
                    className={leftTab === "email" ? "active" : ""}
                    onClick={() => setLeftTab("email")}
                  >
                    Email
                  </button>
                </div>

                <div className="inbox-review-pane">
                  {leftTab === "pdf" ? (
                    pdfUrl ? (
                      <iframe title="Invoice PDF" src={pdfUrl} className="inbox-review-frame" />
                    ) : (
                      <div className="inbox-review-empty">
                        {item?.hasFile ? "Loading PDF…" : "No PDF attachment"}
                      </div>
                    )
                  ) : (
                    <div className="inbox-review-email">
                      <div className="inbox-review-email-meta">
                        <div>
                          <span>From</span>
                          <strong>{fromLabel}</strong>
                        </div>
                        <div>
                          <span>Subject</span>
                          <strong>{item?.subject || "(no subject)"}</strong>
                        </div>
                      </div>
                      {item?.bodyText ? (
                        <pre className="inbox-review-email-body">{item.bodyText}</pre>
                      ) : item?.bodyHtml ? (
                        <iframe
                          title="Email body"
                          sandbox=""
                          referrerPolicy="no-referrer"
                          srcDoc={item.bodyHtml}
                          className="inbox-review-frame"
                        />
                      ) : (
                        <div className="inbox-review-empty">This email has no text.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="tab-content inbox-review-right" style={{ display: "block" }}>
                {readOnly && item ? (
                  <div className="inbox-review-readonly">
                    {item.status === "Converted" ? (
                      <>
                        <p>This email was already turned into a vendor invoice.</p>
                        {item.vendorInvoiceId ? (
                          <button
                            type="button"
                            className="btn-submit"
                            onClick={() =>
                              history.push(`/purchasing/vendor-invoices?open=${item.vendorInvoiceId}`)
                            }
                          >
                            Open vendor invoice
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <p>This email was discarded.</p>
                    )}
                  </div>
                ) : (
                  <>
                    {statusNotice && (
                      <div className={`inbox-review-notice ${statusNotice.tone}`} role="status">
                        {statusNotice.text}
                      </div>
                    )}

                    {item?.extractionProvider && item.status === "Extracted" && (
                      <div className="inbox-review-hint">
                        Prefilled from the PDF. Check every field before creating the bill.
                      </div>
                    )}

                    {unmatchedVendorDraft && vendorId <= 0 && (
                      <div className="direct-extraction-vendor-miss" role="status">
                        <div className="direct-extraction-vendor-miss-text">
                          Vendor{" "}
                          <strong>
                            {unmatchedVendorHint || unmatchedVendorDraft.company_name || "from PDF"}
                          </strong>{" "}
                          was not found in Vendor Master.
                        </div>
                        <div className="direct-extraction-vendor-miss-actions">
                          {canAddVendor && (
                            <button
                              type="button"
                              className="btn-submit"
                              onClick={() => setShowCreateVendor(true)}
                            >
                              Create vendor
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-cancel"
                            onClick={() => {
                              setUnmatchedVendorDraft(null);
                              setUnmatchedVendorHint("");
                            }}
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )}

                    {extractedTotal !== null && Math.abs(extractedTotal - invoiceTotal) > 0.01 && (
                      <div className="direct-extraction-variance" role="status">
                        <div className="direct-extraction-variance-text">
                          PDF total is <strong>{formatCurrency(extractedTotal)}</strong>, but the form
                          total is <strong>{formatCurrency(invoiceTotal)}</strong>. Review line
                          amounts, tax, and freight before saving.
                        </div>
                        <button
                          type="button"
                          className="btn-cancel"
                          onClick={() => setExtractedTotal(null)}
                        >
                          Dismiss
                        </button>
                      </div>
                    )}

                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor="inboxVendor">
                          Vendor <span className="required">*</span>
                        </label>
                        <select
                          id="inboxVendor"
                          className={`form-input ${errors.vendorId ? "error" : ""}`}
                          value={vendorId || ""}
                          disabled={!canAdd}
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
                        {errors.vendorId && <span className="error-message">{errors.vendorId}</span>}
                      </div>
                      <div className="form-group">
                        <label htmlFor="inboxInvoiceNo">Vendor Invoice #</label>
                        <input
                          id="inboxInvoiceNo"
                          type="text"
                          className="form-input"
                          placeholder="Vendor's bill number"
                          value={invoiceNo}
                          disabled={!canAdd}
                          onChange={(e) => {
                            markDirty();
                            setInvoiceNo(e.target.value);
                          }}
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor="inboxInvoiceDate">
                          Invoice Date <span className="required">*</span>
                        </label>
                        <input
                          id="inboxInvoiceDate"
                          type="date"
                          className={`form-input ${errors.invoiceDate ? "error" : ""}`}
                          value={invoiceDate}
                          disabled={!canAdd}
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
                        <label htmlFor="inboxPaymentTerm">Payment Term</label>
                        <select
                          id="inboxPaymentTerm"
                          className="form-input"
                          value={paymentTermId || ""}
                          disabled={!canAdd}
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
                        <label htmlFor="inboxDueDate">
                          Due Date <span className="required">*</span>
                        </label>
                        <input
                          id="inboxDueDate"
                          type="date"
                          className={`form-input ${errors.dueDate ? "error" : ""}`}
                          value={dueDate}
                          disabled={!canAdd}
                          onChange={(e) => {
                            markDirty();
                            setDueDate(e.target.value);
                            setPaymentTermId(0);
                            setErrors((prev) => ({ ...prev, dueDate: "" }));
                          }}
                        />
                        {errors.dueDate && <span className="error-message">{errors.dueDate}</span>}
                      </div>
                    </div>

                    <div className="form-group">
                      <label htmlFor="inboxNotes">Notes</label>
                      <textarea
                        id="inboxNotes"
                        className="form-input"
                        rows={2}
                        placeholder="Optional memo"
                        value={notes}
                        disabled={!canAdd}
                        onChange={(e) => {
                          markDirty();
                          setNotes(e.target.value);
                        }}
                      />
                    </div>

                    <div className="direct-lines-header">
                      <h3>Line Items</h3>
                      {canAdd && (
                        <button type="button" className="btn-add-line" onClick={addLine}>
                          + Add line
                        </button>
                      )}
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
                                  placeholder="Description"
                                  value={line.description}
                                  disabled={!canAdd}
                                  onChange={(e) => updateLine(line.key, "description", e.target.value)}
                                />
                              </td>
                              <td>
                                <select
                                  className="form-input"
                                  value={line.accountId || ""}
                                  disabled={!canAdd}
                                  onChange={(e) =>
                                    updateLine(line.key, "accountId", Number(e.target.value) || 0)
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
                                  disabled={!canAdd}
                                  onChange={(e) => updateLine(line.key, "amount", e.target.value)}
                                />
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="btn-remove-line"
                                  title="Remove line"
                                  disabled={lines.length <= 1 || !canAdd}
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
                          <label htmlFor="inboxTaxRate">Tax Rate %</label>
                          <input
                            id="inboxTaxRate"
                            type="number"
                            className="form-input"
                            min="0"
                            max="100"
                            step="0.01"
                            value={taxRate}
                            disabled={!canAdd}
                            onChange={(e) => {
                              markDirty();
                              setTaxAmountManual(false);
                              setTaxRate(parseFloat(e.target.value) || 0);
                            }}
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="inboxTaxAmount">Tax Amount</label>
                          <input
                            id="inboxTaxAmount"
                            type="number"
                            className="form-input"
                            min="0"
                            step="0.01"
                            value={taxAmount}
                            disabled={!canAdd}
                            onChange={(e) => {
                              markDirty();
                              setTaxAmountManual(true);
                              setTaxAmount(parseFloat(e.target.value) || 0);
                            }}
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="inboxFreight">Freight</label>
                          <input
                            id="inboxFreight"
                            type="number"
                            className="form-input"
                            min="0"
                            step="0.01"
                            value={freightCharge}
                            disabled={!canAdd}
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
                  </>
                )}
              </div>
            </div>

            <div className="form-actions inbox-review-actions">
              {!readOnly && canDelete && (
                <button
                  type="button"
                  className="btn-cancel inbox-review-discard"
                  onClick={handleDiscard}
                  disabled={saving || busyAction}
                >
                  Discard
                </button>
              )}
              {!readOnly && canAdd && item?.hasFile && (item.status === "Failed" || item.status === "Extracted") && (
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={handleRetry}
                  disabled={saving || busyAction}
                  title="Run the PDF extraction again"
                >
                  Re-extract
                </button>
              )}
              <div className="inbox-review-actions-spacer" />
              <button
                type="button"
                className="btn-cancel"
                onClick={handleDismiss}
                disabled={saving || busyAction}
              >
                {readOnly ? "Close" : "Cancel"}
              </button>
              {!readOnly && canAdd && (
                <button type="submit" className="btn-submit" disabled={saving || busyAction}>
                  {saving ? "Saving…" : "Create Invoice"}
                </button>
              )}
            </div>
          </form>
        )}

        {showCreateVendor && (
          <Suspense fallback={null}>
            <VendorMasterSlideout
              vendorId={0}
              initialValues={unmatchedVendorDraft}
              onSaved={async (id) => {
                await loadVendors();
                await handleVendorChange(id);
                setUnmatchedVendorDraft(null);
                setUnmatchedVendorHint("");
                setShowCreateVendor(false);
              }}
              onClose={() => setShowCreateVendor(false)}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
};

export default InvoiceInboxReviewSlideout;
