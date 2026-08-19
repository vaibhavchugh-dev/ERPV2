import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  IconBox,
  IconCalendar,
  IconChevronRight,
  IconCurrency,
  IconQuote,
  IconSearch,
  IconWrench,
} from "../components/Icons";
import {
  QuotationService,
  VendorQuotationMaster,
} from "../services/quotationService";

function formatQuotationNumber(number: number): string {
  const displayNumber = number < 1000 ? number + 999 : number;
  return `VQ#${displayNumber}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }
  } catch {
    /* fall through */
  }
  return dateStr;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
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
    return { bg: "bg-slate-100 dark:bg-slate-700", text: "text-slate-600 dark:text-slate-200", label: "DRAFT" };
  }
  return { bg: "bg-slate-100 dark:bg-slate-700", text: "text-slate-600 dark:text-slate-200", label: status.toUpperCase() };
}

export function QuotationsPage() {
  const { vendorCode } = useAuth();
  const [quotations, setQuotations] = useState<VendorQuotationMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const loadQuotations = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (!vendorCode) {
        setError("Vendor code not found");
        setQuotations([]);
        return;
      }
      const result = await QuotationService.getVendorQuotationsByVendorCode(vendorCode);
      setQuotations(result);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } }; message?: string };
      setError(ax?.response?.data?.message || ax?.message || "Error loading quotations");
      setQuotations([]);
    } finally {
      setLoading(false);
    }
  }, [vendorCode]);

  useEffect(() => {
    void loadQuotations();
  }, [loadQuotations]);

  const visible = useMemo(() => {
    if (!searchQuery.trim()) return quotations;
    const q = searchQuery.toLowerCase();
    return quotations.filter((item) => {
      const num = formatQuotationNumber(item.quotationNumber).toLowerCase();
      const type = (item.quotationType || "").toLowerCase();
      const status = (item.status || "").toLowerCase();
      return num.includes(q) || type.includes(q) || status.includes(q);
    });
  }, [quotations, searchQuery]);

  return (
    <div>
      <header className="mb-5 flex items-center gap-3">
        <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-800 shadow-sm dark:bg-slate-800 dark:text-white">
          <IconQuote size={20} />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 leading-tight dark:text-white">
            Quotations
          </h1>
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-200">
            {vendorCode ? `Vendor ${vendorCode}` : "Vendor Portal"}
          </p>
        </div>
      </header>

      <div className="mb-5 relative">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-500 dark:text-slate-300">
          <IconSearch />
        </div>
        <input
          type="text"
          placeholder="Search quotation, type, status..."
          className="w-full h-11 rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-semibold text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-400 dark:focus:ring-blue-900/50"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-3xl border border-slate-200 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.08)] p-5 animate-pulse dark:border-slate-600 dark:bg-slate-800">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="h-5 bg-slate-200 rounded-md w-36 mb-2 dark:bg-slate-700" />
                  <div className="h-3 bg-slate-100 rounded-md w-28 dark:bg-slate-700" />
                </div>
                <div className="h-6 bg-slate-200 rounded-full w-20 dark:bg-slate-700" />
              </div>
              <div className="h-3 bg-slate-100 rounded w-24 dark:bg-slate-700" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm font-semibold text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300" role="alert">
          <div>{error}</div>
          <button
            type="button"
            className="mt-2 text-xs font-extrabold underline"
            onClick={() => void loadQuotations()}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="rounded-3xl border border-slate-200 bg-white px-5 py-12 text-center shadow-[0_2px_12px_rgba(15,23,42,0.08)] dark:border-slate-600 dark:bg-slate-800">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-200">
            <IconQuote size={22} />
          </div>
          <p className="font-bold text-slate-800 dark:text-white">No quotations found</p>
          <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-300">
            Quotations sent to you will appear here.
          </p>
        </div>
      )}

      <ul className="space-y-4">
        {visible.map((quotation) => {
          const badge = statusBadgeStyle(quotation.status);
          const isService = quotation.quotationType === "Service";
          return (
            <li key={quotation.orderID}>
              <Link
                to={`/quotations/${quotation.orderID}`}
                className="flex items-start gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.08)] transition-transform active:scale-[0.98] dark:border-slate-600 dark:bg-slate-800 dark:shadow-[0_2px_16px_rgba(0,0,0,0.45)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <span className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
                      {formatQuotationNumber(quotation.quotationNumber)}
                    </span>
                    <span className={`shrink-0 px-3 py-1 rounded-full text-[0.65rem] font-extrabold tracking-wider ${badge.bg} ${badge.text}`}>
                      {badge.label}
                    </span>
                  </div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-200">
                    <IconCalendar className="shrink-0" />
                    {formatDate(quotation.orderDate)}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-50 px-3 py-2.5 dark:bg-slate-700/50">
                      <div className="mb-0.5 flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-300">
                        <IconCurrency />
                        Amount
                      </div>
                      <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                        {formatCurrency(quotation.totalAmount)}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-3 py-2.5 dark:bg-slate-700/50">
                      <div className="mb-0.5 flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-300">
                        {isService ? <IconWrench /> : <IconBox />}
                        Type
                      </div>
                      <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                        {isService ? "Service" : "Material"}
                      </div>
                    </div>
                  </div>
                </div>
                <IconChevronRight className="mt-1 shrink-0 text-slate-400 dark:text-slate-300" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
