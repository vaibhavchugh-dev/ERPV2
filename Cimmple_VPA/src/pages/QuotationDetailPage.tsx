import { FormEvent, useCallback, useEffect, useState, type ChangeEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  IconBack,
  IconBox,
  IconCalendar,
  IconCurrency,
  IconExternal,
  IconNotes,
  IconPaperclip,
  IconPlus,
  IconQuote,
  IconTrash,
  IconWrench,
} from "../components/Icons";
import { TopToast } from "../components/TopToast";
import { AuthService } from "../services/authService";
import {
  QuotationAttachment,
  QuotationDetailReq,
  QuotationService,
  VendorQuotationMasterReq,
} from "../services/quotationService";

function formatQuotationNumber(number: number): string {
  const displayNumber = number < 1000 ? number + 999 : number;
  return `VQ#${displayNumber}`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  try {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = String(date.getFullYear());
    return `${month}/${day}/${year}`;
  } catch {
    return dateStr;
  }
}

function sanitizeDecimal(raw: string): string {
  return raw.replace(/[^0-9.]/g, "").replace(/\./g, (match, offset, string) => {
    return string.indexOf(".") === offset ? match : "";
  });
}

function calculateVendorLineTotal(detail: QuotationDetailReq): number {
  const qty = Number(detail.QtyOrdered) || 0;
  const unitPrice = Number(detail.UnitPrice) || 0;
  const discount = Number(detail.Discount) || 0;
  const subtotal = qty * unitPrice;
  if (subtotal <= 0) {
    return 0;
  }
  const discountAmount =
    detail.DiscountType === "Amount"
      ? Math.min(Math.max(discount, 0), subtotal)
      : subtotal * (Math.min(Math.max(discount, 0), 100) / 100);
  return Math.max(0, subtotal - discountAmount);
}

function isLockedVendorStatus(status: string): boolean {
  const s = (status || "").toLowerCase().trim();
  return s === "converted" || s === "rejected" || s === "cancelled" || s === "accepted";
}

function statusBadgeStyle(status: string): { bg: string; text: string; label: string } {
  const s = (status || "").toLowerCase().trim();
  if (s === "accepted") {
    return { bg: "bg-emerald-100 dark:bg-emerald-950/50", text: "text-emerald-700 dark:text-emerald-300", label: "ACCEPTED" };
  }
  if (s === "responded") {
    return { bg: "bg-emerald-100 dark:bg-emerald-950/50", text: "text-emerald-700 dark:text-emerald-300", label: "RESPONDED" };
  }
  if (s === "rejected" || s === "cancelled") {
    return { bg: "bg-red-100 dark:bg-red-950/50", text: "text-red-700 dark:text-red-300", label: s.toUpperCase() };
  }
  if (s === "sent" || s === "active") {
    return { bg: "bg-blue-100 dark:bg-blue-950/50", text: "text-blue-700 dark:text-blue-300", label: "SENT" };
  }
  if (s === "draft" || !s) {
    return { bg: "bg-slate-100 dark:bg-slate-700", text: "text-slate-700 dark:text-slate-200", label: "DRAFT" };
  }
  return { bg: "bg-slate-100 dark:bg-slate-700", text: "text-slate-700 dark:text-slate-200", label: status.toUpperCase() };
}

const emptyForm: VendorQuotationMasterReq = {
  OrderID: 0,
  Tenantid: 0,
  VendorID: 0,
  VendorCode: "",
  PONumber: 0,
  VendorName: "",
  Address: "",
  VendorPoNumber: "",
  OrderDate: "",
  TotalAmount: 0,
  UserId: 0,
  UserToken: 0,
  Status: "Draft",
  ShippingInstructions: "",
  ExternalVendorPO: "",
  BuyerName: "",
  VendorRefNo: "",
  QuotationType: "Material",
  AdditionalNotes: "",
  Details: [],
};

function BackHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-4 flex items-center gap-3">
      <Link
        to="/"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm hover:bg-slate-100 transition-colors dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        aria-label="Back to Quotations"
      >
        <IconBack />
      </Link>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 leading-tight dark:text-white">
          {title}
        </h1>
        {subtitle ? (
          <p className="truncate text-sm font-semibold text-slate-600 dark:text-slate-200">
            {subtitle}
          </p>
        ) : null}
      </div>
    </header>
  );
}

export function QuotationDetailPage() {
  const { quotationId } = useParams();
  const id = Number(quotationId);

  const [formData, setFormData] = useState<VendorQuotationMasterReq>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [numericDisplayValues, setNumericDisplayValues] = useState<Map<string, string>>(new Map());
  const [attachments, setAttachments] = useState<QuotationAttachment[]>([]);
  const [lineItemAttachments, setLineItemAttachments] = useState<Map<number, QuotationAttachment[]>>(new Map());
  const [lineItemAttachmentCounters, setLineItemAttachmentCounters] = useState<Map<number, number>>(new Map());

  const dismissSuccess = useCallback(() => setSuccess(""), []);

  const loadQuotation = useCallback(async () => {
    if (!id) {
      setError("Invalid quotation");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const tenantId = AuthService.getTenantId();
      const result = await QuotationService.getVendorQuotationById(id, tenantId);
      if (!result) {
        setError("Quotation not found");
        return;
      }
      setFormData({
        ...result,
        Tenantid: result.Tenantid || AuthService.getTenantId() || 0,
        UserId: result.UserId || 0,
        UserToken: 0,
        AdditionalNotes: result.AdditionalNotes || "",
      });
      setAttachments(result.Attachments || []);

      const lineItemAttsMap = new Map<number, QuotationAttachment[]>();
      const lineItemCountersMap = new Map<number, number>();
      result.Details.forEach((detail, index) => {
        const atts = detail.Attachments || [];
        lineItemAttsMap.set(index, atts);
        const maxId = atts.length ? Math.max(...atts.map((a) => a.id || 0), 0) : 0;
        lineItemCountersMap.set(index, maxId + 1);
      });
      setLineItemAttachments(lineItemAttsMap);
      setLineItemAttachmentCounters(lineItemCountersMap);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string; error?: string } }; message?: string };
      setError(
        ax?.response?.data?.message ||
          ax?.response?.data?.error ||
          ax?.message ||
          "Error loading quotation"
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadQuotation();
  }, [loadQuotation]);

  const handleDetailChange = (index: number, field: keyof QuotationDetailReq, value: string | number) => {
    setFormData((prev) => {
      const newDetails = [...prev.Details];
      newDetails[index] = { ...newDetails[index], [field]: value };
      const total = newDetails.reduce((sum, detail) => sum + calculateVendorLineTotal(detail), 0);
      return { ...prev, Details: newDetails, TotalAmount: total };
    });
  };

  const handleLineItemFileUpload = (index: number, e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const currentAtts = lineItemAttachments.get(index) || [];
    const counter = lineItemAttachmentCounters.get(index) || 1;
    let newCounter = counter;

    const newAttachments = Array.from(files).map((file) => ({
      id: newCounter++,
      name: file.name,
      size: file.size,
      fileUrl: "",
    }));

    setLineItemAttachments((prev) => {
      const next = new Map(prev);
      next.set(index, [...currentAtts, ...newAttachments]);
      return next;
    });
    setLineItemAttachmentCounters((prev) => {
      const next = new Map(prev);
      next.set(index, newCounter);
      return next;
    });
    e.target.value = "";
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isLockedVendorStatus(formData.Status)) {
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const detailsWithAttachments = formData.Details.map((detail, index) => ({
        ...detail,
        Attachments: lineItemAttachments.get(index) || [],
      }));
      await QuotationService.saveVendorQuotation({
        ...formData,
        Status: "Responded",
        ParentQuotationID: formData.ParentQuotationID,
        Attachments: attachments,
        Details: detailsWithAttachments,
      });
      setFormData((prev) => ({ ...prev, Status: "Responded" }));
      setSuccess("Response submitted successfully");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string; message?: string } }; message?: string };
      setError(
        ax?.response?.data?.error ||
          ax?.response?.data?.message ||
          ax?.message ||
          "Error submitting response"
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <BackHeader title="Quotation" subtitle="Loading..." />
        <div className="space-y-3 animate-pulse">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-600 dark:bg-slate-800">
            <div className="h-5 w-28 rounded-md bg-slate-200 dark:bg-slate-700" />
            <div className="grid grid-cols-2 gap-2">
              <div className="h-14 rounded-xl bg-slate-100 dark:bg-slate-900" />
              <div className="h-14 rounded-xl bg-slate-100 dark:bg-slate-900" />
            </div>
          </div>
          <div className="h-28 rounded-3xl bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  if (error && !formData.OrderID) {
    return (
      <div>
        <BackHeader title="Quotation" />
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300"
          role="alert"
        >
          {error}
        </div>
      </div>
    );
  }

  const badge = statusBadgeStyle(formData.Status);
  const isService = formData.QuotationType === "Service";
  const isReadOnly = isLockedVendorStatus(formData.Status);

  return (
    <div>
      {success && <TopToast message={success} onDismiss={dismissSuccess} />}

      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm hover:bg-slate-100 transition-colors dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            aria-label="Back to Quotations"
          >
            <IconBack />
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 leading-tight dark:text-white">
              Quotation
            </h1>
            <p className="truncate text-sm font-semibold text-slate-600 dark:text-slate-200">
              {formatQuotationNumber(formData.PONumber)}
            </p>
          </div>
        </div>
        <span className={`shrink-0 px-3 py-1 rounded-full text-[0.65rem] font-extrabold tracking-wider ${badge.bg} ${badge.text}`}>
          {badge.label}
        </span>
      </header>

      {error && (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.08)] dark:border-slate-600 dark:bg-slate-800">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold uppercase tracking-widest text-slate-600 dark:text-slate-200">
            <IconQuote size={16} />
            Details
          </h2>
          <dl className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl bg-slate-50 px-3 py-2.5 dark:bg-slate-700/50">
              <dt className="mb-0.5 flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-300">
                <IconQuote size={14} />
                Number
              </dt>
              <dd className="font-extrabold text-slate-900 dark:text-white">
                {formatQuotationNumber(formData.PONumber)}
              </dd>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2.5 dark:bg-slate-700/50">
              <dt className="mb-0.5 flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-300">
                <IconCalendar size={14} />
                Date
              </dt>
              <dd className="font-extrabold text-slate-900 dark:text-white">{formatDate(formData.OrderDate)}</dd>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2.5 dark:bg-slate-700/50">
              <dt className="mb-0.5 flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-300">
                {isService ? <IconWrench size={14} /> : <IconBox size={14} />}
                Type
              </dt>
              <dd className="font-extrabold text-slate-900 dark:text-white">
                {isService ? "Service" : "Material"}
              </dd>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2.5 dark:bg-slate-700/50">
              <dt className="mb-0.5 flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-300">
                <IconCurrency size={14} />
                Total
              </dt>
              <dd className="font-extrabold text-slate-900 dark:text-white">{formatCurrency(formData.TotalAmount)}</dd>
            </div>
          </dl>
        </section>

        <section>
          <h2 className="mb-1 text-sm font-extrabold uppercase tracking-widest text-slate-600 dark:text-slate-200">
            Line items
          </h2>
          <p className="mb-3 text-xs font-semibold text-slate-500 dark:text-slate-300">
            Update unit prices and discounts. Quantities and descriptions are for reference.
          </p>

          {formData.Details.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center font-bold text-slate-500 dark:border-slate-600 dark:bg-slate-800">
              No line items found
            </div>
          ) : (
            <ul className="space-y-3">
              {formData.Details.map((detail, index) => {
                const lineTotal = calculateVendorLineTotal(detail);
                return (
                  <li
                    key={`${detail.ID}-${index}`}
                    className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.08)] dark:border-slate-600 dark:bg-slate-800"
                  >
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-300">
                          Item {detail.ItemNo}
                        </div>
                        <div className="truncate font-extrabold text-slate-900 dark:text-white">
                          {detail.PartName || "—"}
                        </div>
                        <div className="text-xs font-semibold text-slate-600 dark:text-slate-200">
                          {detail.PartNo || "—"} · Qty {detail.QtyOrdered} {detail.Unit || "EA"}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-300">
                          Line total
                        </div>
                        <div className="text-sm font-black text-slate-900 dark:text-white">
                          {formatCurrency(lineTotal)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className="field">
                        Unit price *
                        <input
                          type="text"
                          inputMode="decimal"
                          required={!isReadOnly}
                          disabled={isReadOnly}
                          className="field-input"
                          value={
                            numericDisplayValues.get(`price-${index}`) ??
                            (detail.UnitPrice === 0 ? "" : detail.UnitPrice.toString())
                          }
                          onChange={(e) => {
                            const inputVal = sanitizeDecimal(e.target.value);
                            setNumericDisplayValues((prev) => {
                              const next = new Map(prev);
                              next.set(`price-${index}`, inputVal);
                              return next;
                            });
                            if (inputVal === "" || inputVal === ".") {
                              handleDetailChange(index, "UnitPrice", 0);
                            } else {
                              const val = parseFloat(inputVal);
                              if (!Number.isNaN(val) && val >= 0) {
                                handleDetailChange(index, "UnitPrice", val);
                              }
                            }
                          }}
                          onBlur={(e) => {
                            const val = e.target.value === "" || e.target.value === "." ? 0 : parseFloat(e.target.value) || 0;
                            handleDetailChange(index, "UnitPrice", val);
                            setNumericDisplayValues((prev) => {
                              const next = new Map(prev);
                              next.delete(`price-${index}`);
                              return next;
                            });
                          }}
                        />
                      </label>

                      <label className="field">
                        Discount
                        <input
                          type="text"
                          inputMode="decimal"
                          className="field-input"
                          disabled={isReadOnly}
                          value={
                            numericDisplayValues.get(`discount-${index}`) ??
                            (detail.Discount === 0 ? "" : detail.Discount.toString())
                          }
                          onChange={(e) => {
                            const inputVal = sanitizeDecimal(e.target.value);
                            setNumericDisplayValues((prev) => {
                              const next = new Map(prev);
                              next.set(`discount-${index}`, inputVal);
                              return next;
                            });
                            if (inputVal === "" || inputVal === ".") {
                              handleDetailChange(index, "Discount", 0);
                            } else {
                              const val = parseFloat(inputVal);
                              if (!Number.isNaN(val) && val >= 0) {
                                handleDetailChange(index, "Discount", val);
                              }
                            }
                          }}
                          onBlur={(e) => {
                            const val = e.target.value === "" || e.target.value === "." ? 0 : parseFloat(e.target.value) || 0;
                            handleDetailChange(index, "Discount", val);
                            setNumericDisplayValues((prev) => {
                              const next = new Map(prev);
                              next.delete(`discount-${index}`);
                              return next;
                            });
                          }}
                        />
                      </label>
                    </div>

                    <label className="field mt-2">
                      Notes
                      <textarea
                        className="field-input min-h-[72px] py-3"
                        value={detail.Notes || ""}
                        onChange={(e) => handleDetailChange(index, "Notes", e.target.value)}
                        placeholder="Add notes..."
                        disabled={isReadOnly}
                      />
                    </label>

                    <div className="mt-3 space-y-2">
                      {(lineItemAttachments.get(index) || []).map((att) => (
                        <div
                          key={att.id}
                          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold dark:border-slate-600 dark:bg-slate-700/60"
                        >
                          <IconPaperclip className="shrink-0 text-slate-500" />
                          <span className="flex-1 truncate text-slate-800 dark:text-slate-100">{att.name}</span>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                            aria-label="Remove attachment"
                            onClick={() => {
                              setLineItemAttachments((prev) => {
                                const next = new Map(prev);
                                next.set(index, (next.get(index) || []).filter((a) => a.id !== att.id));
                                return next;
                              });
                            }}
                          >
                            <IconTrash size={14} />
                          </button>
                        </div>
                      ))}
                      <input
                        type="file"
                        multiple
                        id={`lineItemFile-${index}`}
                        className="hidden"
                        onChange={(e) => handleLineItemFileUpload(index, e)}
                      />
                      <label htmlFor={`lineItemFile-${index}`} className="btn btn-secondary w-full gap-1.5 text-sm">
                        <IconPlus size={16} />
                        Add attachment
                      </label>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {attachments.length > 0 && (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.08)] dark:border-slate-600 dark:bg-slate-800">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-extrabold uppercase tracking-widest text-slate-600 dark:text-slate-200">
              <IconPaperclip size={16} />
              Attachments from quotation
            </h2>
            <p className="mb-3 text-xs font-semibold text-slate-500 dark:text-slate-300">
              These attachments were included with the quotation sent to you.
            </p>
            <ul className="space-y-2">
              {attachments.map((attachment) => (
                <li
                  key={attachment.id}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold dark:border-slate-600 dark:bg-slate-700/60"
                >
                  <IconPaperclip className="shrink-0 text-slate-500" />
                  <span className="flex-1 truncate text-slate-800 dark:text-slate-100">{attachment.name}</span>
                  {attachment.fileUrl && (
                    <a
                      href={attachment.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-accent"
                    >
                      View
                      <IconExternal />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.08)] dark:border-slate-600 dark:bg-slate-800">
          <label className="field">
            <span className="flex items-center gap-1.5">
              <IconNotes size={16} />
              Additional notes (optional)
            </span>
            <textarea
              className="field-input min-h-[96px] py-3"
              value={formData.AdditionalNotes || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, AdditionalNotes: e.target.value }))}
              placeholder="Add any additional notes, terms, or conditions..."
              disabled={isReadOnly}
            />
          </label>
        </section>

        <div className="flex gap-3 pt-1">
          <Link to="/" className="btn btn-secondary flex-1">
            Cancel
          </Link>
          <button
            type="submit"
            className="btn btn-primary flex-1"
            disabled={saving || isReadOnly || formData.Details.length === 0}
          >
            {saving ? "Submitting..." : isReadOnly ? "Response locked" : "Submit response"}
          </button>
        </div>
      </form>
    </div>
  );
}
