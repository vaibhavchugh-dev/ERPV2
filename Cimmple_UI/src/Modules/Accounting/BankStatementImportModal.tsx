import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
  AccountingService,
  BankTransaction,
} from "../../Common/Services/AccountingService";
import {
  buildCsv,
  downloadCsv,
  mapCsvRows,
  parseCsv,
} from "../../Common/Utils/CsvImport";
import { useFormatting } from "../../Common/Hooks/useFormatting";
import "../Masters/CustomerMasterSlideout.scss";

export interface BankStatementImportResult {
  reconciledCount: number;
  statementDate?: string;
  statementBalance?: string;
}

interface BankStatementImportModalProps {
  bankAccountId: number;
  bankName: string;
  accountNumber: string;
  onClose: () => void;
  onApplied: (result: BankStatementImportResult) => void;
}

type MatchStatus = "matched" | "ambiguous" | "unmatched" | "invalid";

interface StatementCandidate {
  id: number;
  date: string;
  description: string;
  amount: number;
  reference?: string;
  type: string;
}

interface PreviewRow {
  rowNumber: number;
  date: string;
  description: string;
  amount: number;
  reference: string;
  statementBalance: string;
  status: MatchStatus;
  errors: string[];
  matchedTxnId: number | null;
  /** Suggested picks (sorted); full pool is always available for manual select */
  suggestedIds: number[];
  include: boolean;
}

interface StatementDraft {
  version: 1;
  bankAccountId: number;
  fileName: string;
  savedAt: string;
  rows: Array<{
    rowNumber: number;
    date: string;
    description: string;
    amount: number;
    reference: string;
    statementBalance: string;
    errors: string[];
    matchedTxnId: number | null;
    include: boolean;
  }>;
}

export const STATEMENT_IMPORT_HEADERS = [
  "Date",
  "Description",
  "Amount",
  "Reference",
  "Type",
  "Debit",
  "Credit",
  "StatementBalance",
] as const;

const TEMPLATE_ROWS: string[][] = [
  ["2026-01-05", "ACH Deposit ACME CORP", "1500.00", "ACH-1001", "credit", "", "", ""],
  ["2026-01-06", "Check 4521 Vendor Pay", "-320.50", "4521", "debit", "", "", ""],
  ["2026-01-07", "Bank Fee", "", "FEE-01", "debit", "15.00", "", "1164.50"],
];

const HEADER_ALIASES: Record<string, string> = {
  date: "Date",
  transactiondate: "Date",
  posteddate: "Date",
  valuedate: "Date",
  description: "Description",
  memo: "Description",
  narration: "Description",
  particulars: "Description",
  details: "Description",
  amount: "Amount",
  reference: "Reference",
  ref: "Reference",
  checknumber: "Reference",
  checkno: "Reference",
  cheque: "Reference",
  chequeno: "Reference",
  txnid: "Reference",
  transactionid: "Reference",
  type: "Type",
  creditdebit: "Type",
  drcr: "Type",
  debit: "Debit",
  withdrawal: "Debit",
  moneyout: "Debit",
  credit: "Credit",
  deposit: "Credit",
  moneyin: "Credit",
  statementbalance: "StatementBalance",
  endingbalance: "StatementBalance",
  closingbalance: "StatementBalance",
  balance: "StatementBalance",
};

const draftStorageKey = (bankAccountId: number) => {
  const storage = JSON.parse(localStorage.getItem("storage") || "{}");
  const tenantId = storage?.tenantID || 0;
  return `bank-statement-import-draft:${tenantId}:${bankAccountId}`;
};

const loadDraft = (bankAccountId: number): StatementDraft | null => {
  try {
    const raw = localStorage.getItem(draftStorageKey(bankAccountId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StatementDraft;
    if (parsed?.version !== 1 || parsed.bankAccountId !== bankAccountId) return null;
    if (!Array.isArray(parsed.rows) || parsed.rows.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
};

const saveDraft = (
  bankAccountId: number,
  fileName: string,
  rows: PreviewRow[]
): void => {
  if (rows.length === 0) {
    localStorage.removeItem(draftStorageKey(bankAccountId));
    return;
  }
  const draft: StatementDraft = {
    version: 1,
    bankAccountId,
    fileName: fileName || "saved-statement.csv",
    savedAt: new Date().toISOString(),
    rows: rows.map((r) => ({
      rowNumber: r.rowNumber,
      date: r.date,
      description: r.description,
      amount: r.amount,
      reference: r.reference,
      statementBalance: r.statementBalance,
      errors: r.errors,
      matchedTxnId: r.matchedTxnId,
      include: r.include,
    })),
  };
  localStorage.setItem(draftStorageKey(bankAccountId), JSON.stringify(draft));
};

const clearDraft = (bankAccountId: number) => {
  localStorage.removeItem(draftStorageKey(bankAccountId));
};

const roundCents = (n: number) => Math.round(n * 100);

const parseAmountToken = (raw: string): number | null => {
  const cleaned = (raw || "")
    .trim()
    .replace(/[$£€,\s]/g, "")
    .replace(/^\((.+)\)$/, "-$1");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const parseFlexibleDate = (raw: string): string | null => {
  const s = (raw || "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  const mdy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (mdy) {
    let month = Number(mdy[1]);
    let day = Number(mdy[2]);
    let year = Number(mdy[3]);
    if (year < 100) year += 2000;
    if (month > 12 && day <= 12) {
      const tmp = month;
      month = day;
      day = tmp;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const daysBetween = (a: string, b: string): number => {
  if (!a || !b) return 9999;
  const da = new Date(`${a}T00:00:00`);
  const db = new Date(`${b}T00:00:00`);
  return Math.abs(Math.round((da.getTime() - db.getTime()) / 86400000));
};

const normalizeText = (s: string) =>
  (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const fuzzyDescriptionMatch = (a: string, b: string): boolean => {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const tokensA = new Set(na.split(" ").filter((t) => t.length > 2));
  const tokensB = nb.split(" ").filter((t) => t.length > 2);
  if (tokensA.size === 0 || tokensB.length === 0) return false;
  const overlap = tokensB.filter((t) => tokensA.has(t)).length;
  return overlap >= Math.min(2, tokensB.length);
};

const resolveSignedAmount = (values: Record<string, string>): number | null => {
  const typeRaw = (values.Type || "").trim().toLowerCase();
  const isCreditType =
    typeRaw === "credit" ||
    typeRaw === "cr" ||
    typeRaw === "deposit" ||
    typeRaw === "c";
  const isDebitType =
    typeRaw === "debit" ||
    typeRaw === "dr" ||
    typeRaw === "withdrawal" ||
    typeRaw === "payment" ||
    typeRaw === "d";

  const debit = parseAmountToken(values.Debit || "");
  const credit = parseAmountToken(values.Credit || "");
  if (debit != null && debit !== 0 && (credit == null || credit === 0)) {
    return -Math.abs(debit);
  }
  if (credit != null && credit !== 0 && (debit == null || debit === 0)) {
    return Math.abs(credit);
  }

  const amount = parseAmountToken(values.Amount || "");
  if (amount == null) return null;
  if (isCreditType) return Math.abs(amount);
  if (isDebitType) return -Math.abs(amount);
  return amount;
};

const toCandidate = (t: BankTransaction): StatementCandidate => ({
  id: t.id,
  date: (t.date || "").slice(0, 10),
  description: t.description || "",
  amount: t.amount,
  reference: t.reference || "",
  type: t.type,
});

/** Score book txns for suggestions; lower is better. */
const suggestionScore = (
  date: string,
  amount: number,
  description: string,
  reference: string,
  t: BankTransaction
): number => {
  const tDate = (t.date || "").slice(0, 10);
  const dayGap = daysBetween(date, tDate);
  const sameSign = roundCents(t.amount) === roundCents(amount);
  const sameAbs = roundCents(Math.abs(t.amount)) === roundCents(Math.abs(amount));
  if (!sameAbs) return 10_000 + dayGap;

  let score = dayGap;
  if (!sameSign) score += 50;
  const refNorm = normalizeText(reference);
  const tRef = normalizeText(t.reference || "");
  if (refNorm && tRef && refNorm === tRef) score -= 20;
  if (fuzzyDescriptionMatch(description, t.description || "")) score -= 10;
  if (dayGap === 0 && sameSign) score -= 5;
  return score;
};

const matchStatementLine = (
  date: string,
  amount: number,
  description: string,
  reference: string,
  pool: BankTransaction[],
  usedIds: Set<number>
): { status: MatchStatus; matchedTxnId: number | null; suggestedIds: number[] } => {
  const available = pool.filter((t) => !t.reconciled && !usedIds.has(t.id));

  const ranked = available
    .map((t) => ({ t, score: suggestionScore(date, amount, description, reference, t) }))
    .filter((x) => x.score < 10_000)
    .sort((a, b) => a.score - b.score || a.t.id - b.t.id);

  const suggestedIds = ranked.slice(0, 12).map((x) => x.t.id);

  const amountMatches = available.filter(
    (t) => roundCents(t.amount) === roundCents(amount)
  );

  if (amountMatches.length === 0) {
    return { status: "unmatched", matchedTxnId: null, suggestedIds };
  }

  const refNorm = normalizeText(reference);

  if (refNorm) {
    const withRef = amountMatches.filter((t) => {
      const tRef = normalizeText(t.reference || "");
      return tRef && tRef === refNorm && daysBetween(date, (t.date || "").slice(0, 10)) === 0;
    });
    if (withRef.length === 1) {
      return { status: "matched", matchedTxnId: withRef[0].id, suggestedIds };
    }
    if (withRef.length > 1) {
      return { status: "ambiguous", matchedTxnId: null, suggestedIds };
    }
  }

  const within1 = amountMatches.filter(
    (t) => daysBetween(date, (t.date || "").slice(0, 10)) <= 1
  );
  if (within1.length === 1) {
    return { status: "matched", matchedTxnId: within1[0].id, suggestedIds };
  }
  if (within1.length > 1) {
    const exactDate = within1.filter(
      (t) => daysBetween(date, (t.date || "").slice(0, 10)) === 0
    );
    if (exactDate.length === 1) {
      return { status: "matched", matchedTxnId: exactDate[0].id, suggestedIds };
    }
    return { status: "ambiguous", matchedTxnId: null, suggestedIds };
  }

  const within3Fuzzy = amountMatches.filter((t) => {
    const d = daysBetween(date, (t.date || "").slice(0, 10));
    return d <= 3 && fuzzyDescriptionMatch(description, t.description || "");
  });
  if (within3Fuzzy.length === 1) {
    return { status: "matched", matchedTxnId: within3Fuzzy[0].id, suggestedIds };
  }
  if (within3Fuzzy.length > 1) {
    return { status: "ambiguous", matchedTxnId: null, suggestedIds };
  }

  return { status: "unmatched", matchedTxnId: null, suggestedIds };
};

const statusPill = (status: MatchStatus): { label: string; bg: string; color: string } => {
  switch (status) {
    case "matched":
      return { label: "Matched", bg: "#d1fae5", color: "#065f46" };
    case "ambiguous":
      return { label: "Ambiguous", bg: "#fef3c7", color: "#92400e" };
    case "invalid":
      return { label: "Invalid", bg: "#fee2e2", color: "#991b1b" };
    default:
      return { label: "Unmatched", bg: "#f3f4f6", color: "#374151" };
  }
};

const formatTxnOption = (
  t: StatementCandidate,
  formatDateFn: (d: string) => string,
  formatCurrencyFn: (n: number) => string
) => {
  const desc =
    t.description.length > 36 ? `${t.description.slice(0, 36)}…` : t.description || "(no description)";
  return `${formatDateFn(t.date)} · ${desc} · ${t.amount >= 0 ? "+" : ""}${formatCurrencyFn(t.amount)}`;
};

const BankStatementImportModal: React.FC<BankStatementImportModalProps> = ({
  bankAccountId,
  bankName,
  accountNumber,
  onClose,
  onApplied,
}) => {
  const { formatCurrency, formatDate } = useFormatting();
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [applying, setApplying] = useState(false);
  const [loadingPool, setLoadingPool] = useState(false);
  const [bookPool, setBookPool] = useState<BankTransaction[]>([]);
  const [draftInfo, setDraftInfo] = useState<{ savedAt: string; fileName: string } | null>(null);
  const [rowFilter, setRowFilter] = useState<"all" | "needs_action" | "matched">("all");

  const matchedCount = useMemo(
    () =>
      previewRows.filter(
        (r) => r.include && r.status === "matched" && r.matchedTxnId != null
      ).length,
    [previewRows]
  );
  const ambiguousCount = useMemo(
    () => previewRows.filter((r) => r.status === "ambiguous").length,
    [previewRows]
  );
  const unmatchedCount = useMemo(
    () => previewRows.filter((r) => r.status === "unmatched").length,
    [previewRows]
  );
  const invalidCount = useMemo(
    () => previewRows.filter((r) => r.status === "invalid").length,
    [previewRows]
  );
  const pendingCount = useMemo(
    () => previewRows.filter((r) => r.status === "unmatched" || r.status === "ambiguous").length,
    [previewRows]
  );

  const bookById = useMemo(() => {
    const map = new Map<number, BankTransaction>();
    bookPool.forEach((t) => map.set(t.id, t));
    return map;
  }, [bookPool]);

  const fetchBookPool = async (): Promise<BankTransaction[]> => {
    const fetched = await AccountingService.GetBankTransactions(
      bankAccountId,
      "1900-01-01",
      "2099-12-31"
    );
    return (fetched || []).filter((t) => !t.reconciled);
  };

  const hydrateRows = (
    draftRows: Array<{
      rowNumber: number;
      date: string;
      description: string;
      amount: number;
      reference: string;
      statementBalance: string;
      errors: string[];
      matchedTxnId?: number | null;
      include?: boolean;
    }>,
    pool: BankTransaction[],
    autoMatchMissing: boolean
  ): PreviewRow[] => {
    const usedIds = new Set<number>();

    draftRows.forEach((d) => {
      if (
        d.matchedTxnId != null &&
        pool.some((t) => t.id === d.matchedTxnId && !t.reconciled)
      ) {
        usedIds.add(d.matchedTxnId);
      }
    });

    return draftRows.map((d) => {
      if (d.errors.length > 0 || !d.date) {
        return {
          ...d,
          errors: d.errors.length ? d.errors : ["Valid date is required"],
          status: "invalid" as const,
          matchedTxnId: null,
          suggestedIds: [],
          include: false,
        };
      }

      const preservedId =
        d.matchedTxnId != null &&
        pool.some((t) => t.id === d.matchedTxnId && !t.reconciled)
          ? d.matchedTxnId
          : null;

      if (preservedId != null) {
        const excludePreserved = new Set(
          Array.from(usedIds).filter((id) => id !== preservedId)
        );
        const suggestedIds = matchStatementLine(
          d.date,
          d.amount,
          d.description,
          d.reference,
          pool,
          excludePreserved
        ).suggestedIds;
        return {
          ...d,
          status: "matched" as const,
          matchedTxnId: preservedId,
          suggestedIds,
          include: d.include !== false,
        };
      }

      if (!autoMatchMissing) {
        const suggestedIds = matchStatementLine(
          d.date,
          d.amount,
          d.description,
          d.reference,
          pool,
          usedIds
        ).suggestedIds;
        return {
          ...d,
          status: "unmatched" as const,
          matchedTxnId: null,
          suggestedIds,
          include: false,
        };
      }

      const match = matchStatementLine(
        d.date,
        d.amount,
        d.description,
        d.reference,
        pool,
        usedIds
      );
      if (match.matchedTxnId != null) usedIds.add(match.matchedTxnId);
      return {
        ...d,
        status: match.status,
        matchedTxnId: match.matchedTxnId,
        suggestedIds: match.suggestedIds,
        include: match.status === "matched",
      };
    });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingPool(true);
      try {
        const pool = await fetchBookPool();
        if (cancelled) return;
        setBookPool(pool);

        const existing = loadDraft(bankAccountId);
        if (existing) {
          setDraftInfo({ savedAt: existing.savedAt, fileName: existing.fileName });
          setFileName(existing.fileName);
          setPreviewRows(hydrateRows(existing.rows, pool, true));
          toast.info("Restored saved statement draft for this bank account");
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) toast.error("Failed to load book transactions for matching");
      } finally {
        if (!cancelled) setLoadingPool(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bankAccountId]);

  const downloadTemplate = () => {
    const contents = buildCsv(STATEMENT_IMPORT_HEADERS, TEMPLATE_ROWS);
    downloadCsv("bank-statement-import-template.csv", contents);
  };

  const buildPreviewFromCsv = async (text: string, name: string) => {
    const parsed = mapCsvRows(parseCsv(text), HEADER_ALIASES, "Date");
    if (parsed.length === 0) {
      toast.error("No data rows found in the CSV");
      setPreviewRows([]);
      return;
    }

    const draft = parsed.map(({ rowNumber, values }) => {
      const errors: string[] = [];
      const date = parseFlexibleDate(values.Date || "");
      if (!date) errors.push("Valid date is required");

      const amount = resolveSignedAmount(values);
      if (amount == null) errors.push("Amount, Debit, or Credit is required");

      return {
        rowNumber,
        date: date || "",
        description: (values.Description || "").trim(),
        amount: amount ?? 0,
        reference: (values.Reference || "").trim(),
        statementBalance: (values.StatementBalance || "").trim(),
        errors,
        matchedTxnId: null as number | null,
        include: false,
      };
    });

    setLoadingPool(true);
    try {
      const pool = await fetchBookPool();
      setBookPool(pool);
      const rows = hydrateRows(draft, pool, true);
      setPreviewRows(rows);
      setFileName(name);
      setDraftInfo(null);
      saveDraft(bankAccountId, name, rows);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load book transactions for matching");
    } finally {
      setLoadingPool(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await buildPreviewFromCsv(text, file.name);
    } catch (err: any) {
      toast.error(err.message || "Failed to parse CSV");
      setPreviewRows([]);
    }
    e.target.value = "";
  };

  const optionsForRow = (row: PreviewRow): StatementCandidate[] => {
    const claimed = new Set(
      previewRows
        .filter((r) => r.rowNumber !== row.rowNumber && r.matchedTxnId != null)
        .map((r) => r.matchedTxnId as number)
    );

    const available = bookPool
      .filter((t) => !t.reconciled && (!claimed.has(t.id) || t.id === row.matchedTxnId))
      .map(toCandidate);

    const scoreOf = (c: StatementCandidate) => {
      const full = bookById.get(c.id);
      if (!full) return 9999;
      return suggestionScore(row.date, row.amount, row.description, row.reference, full);
    };

    const suggestedSet = new Set(row.suggestedIds);
    const suggested = available
      .filter((t) => suggestedSet.has(t.id))
      .sort((a, b) => scoreOf(a) - scoreOf(b));

    const rest = available
      .filter((t) => !suggestedSet.has(t.id))
      .sort((a, b) => {
        const da = daysBetween(row.date, a.date) - daysBetween(row.date, b.date);
        if (da !== 0) return da;
        return (
          Math.abs(Math.abs(a.amount) - Math.abs(row.amount)) -
          Math.abs(Math.abs(b.amount) - Math.abs(row.amount))
        );
      })
      .slice(0, 200);

    return [...suggested, ...rest];
  };

  const setRowMatch = (rowNumber: number, txnId: number | null) => {
    setPreviewRows((prev) => {
      const claimed = new Set(
        prev
          .filter((r) => r.rowNumber !== rowNumber && r.matchedTxnId != null)
          .map((r) => r.matchedTxnId as number)
      );
      if (txnId != null && claimed.has(txnId)) {
        toast.warning("That book transaction is already matched to another line");
        return prev;
      }
      const next = prev.map((r) => {
        if (r.rowNumber !== rowNumber) return r;
        if (txnId == null) {
          return {
            ...r,
            matchedTxnId: null,
            status: (r.errors.length ? "invalid" : "unmatched") as MatchStatus,
            include: false,
          };
        }
        return {
          ...r,
          matchedTxnId: txnId,
          status: "matched" as const,
          include: true,
        };
      });
      saveDraft(bankAccountId, fileName, next);
      return next;
    });
  };

  const toggleInclude = (rowNumber: number) => {
    setPreviewRows((prev) => {
      const next = prev.map((r) =>
        r.rowNumber === rowNumber && r.matchedTxnId != null
          ? { ...r, include: !r.include }
          : r
      );
      saveDraft(bankAccountId, fileName, next);
      return next;
    });
  };

  const persistAndClose = () => {
    if (previewRows.length > 0) {
      saveDraft(bankAccountId, fileName, previewRows);
      toast.info("Statement draft saved. Open Import Statement again to continue.");
    }
    onClose();
  };

  const handleClearDraft = () => {
    clearDraft(bankAccountId);
    setPreviewRows([]);
    setFileName("");
    setDraftInfo(null);
    toast.success("Saved statement draft cleared");
  };

  const extractStatementMeta = (rows: PreviewRow[]) => {
    const dates = rows
      .filter((r) => r.date && r.status !== "invalid")
      .map((r) => r.date)
      .sort();
    const statementDate = dates.length ? dates[dates.length - 1] : undefined;
    let statementBalance: string | undefined;
    for (let i = rows.length - 1; i >= 0; i--) {
      const bal = parseAmountToken(rows[i].statementBalance);
      if (bal != null) {
        statementBalance = String(bal);
        break;
      }
    }
    return { statementDate, statementBalance };
  };

  const handleApply = async () => {
    const toReconcile = previewRows.filter(
      (r) => r.include && r.matchedTxnId != null
    );
    if (toReconcile.length === 0) {
      toast.error("No matched lines selected to reconcile");
      return;
    }

    const ids = Array.from(new Set(toReconcile.map((r) => r.matchedTxnId as number)));
    setApplying(true);
    try {
      await AccountingService.BulkReconcileTransactions(ids);

      const reconciledSet = new Set(ids);
      const after = previewRows.filter(
        (r) => !(r.include && r.matchedTxnId != null && reconciledSet.has(r.matchedTxnId))
      );

      const meta = extractStatementMeta(previewRows);
      onApplied({
        reconciledCount: ids.length,
        statementDate: meta.statementDate,
        statementBalance: meta.statementBalance,
      });

      const pool = await fetchBookPool();
      setBookPool(pool);

      if (after.length > 0) {
        const refreshed = hydrateRows(
          after.map((r) => ({
            ...r,
            matchedTxnId:
              r.matchedTxnId != null && reconciledSet.has(r.matchedTxnId)
                ? null
                : r.matchedTxnId,
            include:
              r.matchedTxnId != null && reconciledSet.has(r.matchedTxnId) ? false : r.include,
          })),
          pool,
          false
        );
        setPreviewRows(refreshed);
        saveDraft(bankAccountId, fileName, refreshed);
        setDraftInfo({
          savedAt: new Date().toISOString(),
          fileName: fileName || "saved-statement.csv",
        });
        toast.success(
          `${ids.length} reconciled. ${refreshed.length} line${refreshed.length === 1 ? "" : "s"} left — draft saved.`
        );
      } else {
        clearDraft(bankAccountId);
        setPreviewRows([]);
        setDraftInfo(null);
        setFileName("");
        toast.success(
          `${ids.length} transaction${ids.length === 1 ? "" : "s"} reconciled from statement`
        );
        onClose();
      }
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error || error?.message || "Failed to reconcile matches"
      );
    } finally {
      setApplying(false);
    }
  };

  const visibleRows = useMemo(() => {
    if (rowFilter === "matched") {
      return previewRows.filter((r) => r.status === "matched");
    }
    if (rowFilter === "needs_action") {
      return previewRows.filter(
        (r) => r.status === "unmatched" || r.status === "ambiguous" || r.status === "invalid"
      );
    }
    return previewRows;
  }, [previewRows, rowFilter]);

  return (
    <div className="slideout-overlay" onClick={persistAndClose}>
      <div
        className="form-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "1100px", width: "95vw" }}
      >
        <div className="form-header">
          <h2>Import Bank Statement</h2>
          <button type="button" className="btn-close" onClick={persistAndClose}>
            ×
          </button>
        </div>

        <div className="tab-content" style={{ padding: "0 1.5rem 1rem" }}>
          <p style={{ color: "#6b7280", fontSize: "0.875rem", marginTop: 0 }}>
            Match statement lines to book transactions for{" "}
            <strong>
              {bankName}
              {accountNumber ? ` · ${accountNumber}` : ""}
            </strong>
            . Unmatched lines can be linked manually from the Book match list. Closing saves a
            draft so you can finish later.
          </p>

          {draftInfo && (
            <div
              style={{
                marginBottom: "0.75rem",
                padding: "0.625rem 0.75rem",
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                borderRadius: "0.375rem",
                fontSize: "0.8125rem",
                color: "#1e40af",
                display: "flex",
                justifyContent: "space-between",
                gap: "0.75rem",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <span>
                Draft: {draftInfo.fileName} · saved{" "}
                {new Date(draftInfo.savedAt).toLocaleString()}
                {pendingCount > 0 ? ` · ${pendingCount} still need a match` : ""}
              </span>
              <button
                type="button"
                className="btn-cancel"
                style={{ padding: "0.25rem 0.625rem", fontSize: "0.8125rem" }}
                onClick={handleClearDraft}
              >
                Clear draft
              </button>
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              flexWrap: "wrap",
              marginBottom: "1rem",
              alignItems: "center",
            }}
          >
            <button type="button" className="btn-cancel" onClick={downloadTemplate}>
              Download Template
            </button>
            <label className="btn-submit">
              Choose CSV
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
            </label>
            {fileName && (
              <span style={{ fontSize: "0.875rem", color: "#374151" }}>{fileName}</span>
            )}
            {loadingPool && (
              <span style={{ fontSize: "0.875rem", color: "#6b7280" }}>Loading matches…</span>
            )}
          </div>

          {previewRows.length > 0 && (
            <>
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                  marginBottom: "0.75rem",
                  fontSize: "0.8125rem",
                  alignItems: "center",
                }}
              >
                {(
                  [
                    ["Matched", matchedCount, "#d1fae5", "#065f46"],
                    ["Ambiguous", ambiguousCount, "#fef3c7", "#92400e"],
                    ["Unmatched", unmatchedCount, "#f3f4f6", "#374151"],
                    ["Invalid", invalidCount, "#fee2e2", "#991b1b"],
                  ] as const
                ).map(([label, count, bg, color]) => (
                  <span
                    key={label}
                    style={{
                      padding: "0.25rem 0.625rem",
                      borderRadius: "9999px",
                      background: bg,
                      color,
                      fontWeight: 500,
                    }}
                  >
                    {label}: {count}
                  </span>
                ))}
                <select
                  value={rowFilter}
                  onChange={(e) =>
                    setRowFilter(e.target.value as "all" | "needs_action" | "matched")
                  }
                  style={{
                    marginLeft: "auto",
                    padding: "0.25rem 0.5rem",
                    border: "1px solid #d1d5db",
                    borderRadius: "0.375rem",
                    fontSize: "0.8125rem",
                  }}
                  aria-label="Filter statement lines"
                >
                  <option value="all">Show all lines</option>
                  <option value="needs_action">Needs action</option>
                  <option value="matched">Matched only</option>
                </select>
              </div>

              <div
                style={{
                  maxHeight: "360px",
                  overflow: "auto",
                  border: "1px solid #e5e7eb",
                  borderRadius: "0.5rem",
                }}
              >
                <table className="customers-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>Use</th>
                      <th>#</th>
                      <th>Date</th>
                      <th>Description</th>
                      <th style={{ textAlign: "right" }}>Amount</th>
                      <th>Reference</th>
                      <th>Status</th>
                      <th>Book match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => {
                      const pill = statusPill(row.status);
                      const options = row.status === "invalid" ? [] : optionsForRow(row);
                      const suggested = options.filter((c) => row.suggestedIds.includes(c.id));
                      const rest = options.filter((c) => !row.suggestedIds.includes(c.id));
                      return (
                        <tr
                          key={row.rowNumber}
                          style={
                            row.status === "invalid"
                              ? { background: "#fef2f2" }
                              : row.status === "ambiguous"
                                ? { background: "#fffbeb" }
                                : undefined
                          }
                        >
                          <td>
                            <input
                              type="checkbox"
                              checked={row.include && row.matchedTxnId != null}
                              disabled={row.matchedTxnId == null}
                              onChange={() => toggleInclude(row.rowNumber)}
                              aria-label={`Include row ${row.rowNumber}`}
                            />
                          </td>
                          <td>{row.rowNumber}</td>
                          <td>{row.date ? formatDate(row.date) : "—"}</td>
                          <td>{row.description || "—"}</td>
                          <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                            {row.errors.some((e) => e.includes("Amount"))
                              ? "—"
                              : `${row.amount >= 0 ? "+" : ""}${formatCurrency(row.amount)}`}
                          </td>
                          <td>{row.reference || "—"}</td>
                          <td>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "0.125rem 0.5rem",
                                borderRadius: "9999px",
                                background: pill.bg,
                                color: pill.color,
                                fontSize: "0.75rem",
                                fontWeight: 600,
                              }}
                            >
                              {pill.label}
                            </span>
                            {row.errors.length > 0 && (
                              <div style={{ color: "#dc2626", fontSize: "0.75rem", marginTop: 4 }}>
                                {row.errors.join("; ")}
                              </div>
                            )}
                          </td>
                          <td style={{ minWidth: 280 }}>
                            {row.status === "invalid" ? (
                              <span style={{ fontSize: "0.8125rem", color: "#9ca3af" }}>
                                Fix CSV row to match
                              </span>
                            ) : options.length === 0 ? (
                              <span style={{ fontSize: "0.8125rem", color: "#9ca3af" }}>
                                No unreconciled book transactions available
                              </span>
                            ) : (
                              <select
                                value={row.matchedTxnId ?? ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setRowMatch(row.rowNumber, v ? Number(v) : null);
                                }}
                                style={{
                                  width: "100%",
                                  padding: "0.35rem 0.5rem",
                                  border: "1px solid #d1d5db",
                                  borderRadius: "0.375rem",
                                  fontSize: "0.8125rem",
                                }}
                              >
                                <option value="">Select book transaction…</option>
                                {suggested.length > 0 && (
                                  <optgroup label="Suggested">
                                    {suggested.map((c) => (
                                      <option key={`s-${c.id}`} value={c.id}>
                                        {formatTxnOption(c, formatDate, formatCurrency)}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                {rest.length > 0 && (
                                  <optgroup label="All unreconciled">
                                    {rest.map((c) => (
                                      <option key={`a-${c.id}`} value={c.id}>
                                        {formatTxnOption(c, formatDate, formatCurrency)}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                              </select>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="form-actions" style={{ flexShrink: 0 }}>
          <button type="button" className="btn-cancel" onClick={persistAndClose}>
            Save & Close
          </button>
          <button
            type="button"
            className="btn-submit"
            disabled={applying || matchedCount === 0 || loadingPool}
            onClick={handleApply}
          >
            {applying
              ? "Reconciling…"
              : `Reconcile ${matchedCount || ""} Match${matchedCount === 1 ? "" : "es"}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BankStatementImportModal;
