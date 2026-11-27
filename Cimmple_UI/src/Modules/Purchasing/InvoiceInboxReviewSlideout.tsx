import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faFilePdf } from "@fortawesome/free-solid-svg-icons";
import {
  InboxDocumentType,
  InvoiceInboxItemDetail,
  InvoiceInboxService,
} from "../../Common/Services/InvoiceInboxService";
import {
  VendorInvoiceService,
  CreateDirectVendorInvoiceRequest,
} from "../../Common/Services/VendorInvoiceService";
import { VendorService } from "../../Common/Services/VendorService";
import { CustomerService } from "../../Common/Services/CustomerService";
import { ChartofAccountsService } from "../../Common/Services/ChartofAccountsService";
import { AccountingService } from "../../Common/Services/AccountingService";
import {
  QuotationService,
  type QuotationDetailReq,
} from "../../Common/Services/QuotationService";
import { OrderService, type OrderDetailReq } from "../../Common/Services/OrderService";
import {
  VendorOrderService,
  type VendorOrderDetailReq,
} from "../../Common/Services/VendorOrderService";
import {
  applyDirectVendorInvoiceImport,
  buildCustomerDocumentReview,
  buildVendorInvoiceReview,
  buildVendorOrderReview,
  buildVendorQuotationReview,
  type ExtractedVendorDraft,
  type VendorQuotationExtractionResult,
} from "../../Common/DocumentExtraction";
import { useFormatting } from "../../Common/Hooks/useFormatting";
import { usePagePermissions } from "../../Common/Hooks/usePagePermissions";
import { todayIsoInTenantTimezone } from "../../Common/Utils/Formatting";
import { confirmDiscardChanges, onBackdropClick } from "../../Common/Utils/dismissGuard";
import { DOC_TYPE_META } from "./InvoiceInbox";
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

interface BillLineDraft {
  key: string;
  description: string;
  amount: string;
  accountId: number;
}

interface TradeLineDraft {
  key: string;
  partNo: string;
  partName: string;
  qty: string;
  unit: string;
  unitPrice: string;
  discount: string;
  notes: string;
}

interface PartyOption {
  id: number;
  name: string;
  code: string;
  address?: string;
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

const emptyBillLine = (accountId = 0): BillLineDraft => ({
  key: newLineKey(),
  description: "",
  amount: "",
  accountId,
});

const emptyTradeLine = (): TradeLineDraft => ({
  key: newLineKey(),
  partNo: "",
  partName: "",
  qty: "1",
  unit: "EA",
  unitPrice: "",
  discount: "0",
  notes: "",
});

const tradeLineTotal = (line: TradeLineDraft): number => {
  const qty = parseFloat(line.qty) || 0;
  const price = parseFloat(line.unitPrice) || 0;
  const disc = Math.min(Math.max(parseFloat(line.discount) || 0, 0), 100);
  return Math.round(Math.max(0, qty * price * (1 - disc / 100)) * 100) / 100;
};

const convertedRouteFor = (docType: InboxDocumentType, recordId: number): string => {
  switch (docType) {
    case "customerQuotation":
      return `/quotations/customer?open=${recordId}`;
    case "customerOrder":
      return `/orders/customer?open=${recordId}`;
    case "customerInvoice":
      return `/orders/customer-invoices?open=${recordId}`;
    case "vendorQuotation":
      return `/quotations/vendor?open=${recordId}`;
    case "vendorOrder":
      return `/purchasing/vendor-orders?open=${recordId}`;
    case "vendorInvoice":
    default:
      return `/purchasing/vendor-invoices?open=${recordId}`;
  }
};

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
  // Email tab is shown first by default; user can switch to Attachment (PDF)
  const [leftTab, setLeftTab] = useState<"email" | "pdf">("email");

  const [vendors, setVendors] = useState<PartyOption[]>([]);
  const [customers, setCustomers] = useState<PartyOption[]>([]);
  const [coaAccounts, setCoaAccounts] = useState<CoaOption[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTermOption[]>([]);
  const [defaultExpenseAccountId, setDefaultExpenseAccountId] = useState(0);

  // Shared header fields
  const [partyId, setPartyId] = useState(0);
  const [docNumber, setDocNumber] = useState("");
  const [refNumber, setRefNumber] = useState("");
  const [docDate, setDocDate] = useState(() => todayIsoInTenantTimezone());
  const [dueDate, setDueDate] = useState(() =>
    addDaysToIsoDate(todayIsoInTenantTimezone(), 30)
  );
  const [paymentTermId, setPaymentTermId] = useState(0);
  const [materialType, setMaterialType] = useState("Material");
  const [shippingInstructions, setShippingInstructions] = useState("");
  const [notes, setNotes] = useState("");

  // Vendor invoice specific fields
  const [taxRate, setTaxRate] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [taxAmountManual, setTaxAmountManual] = useState(false);
  const [freightCharge, setFreightCharge] = useState(0);
  const [billLines, setBillLines] = useState<BillLineDraft[]>([emptyBillLine()]);

  // Trade document lines (CQ, CO, VQ, VO, CI)
  const [tradeLines, setTradeLines] = useState<TradeLineDraft[]>([emptyTradeLine()]);

  const [extractedTotal, setExtractedTotal] = useState<number | null>(null);
  const [unmatchedVendorDraft, setUnmatchedVendorDraft] =
    useState<ExtractedVendorDraft | null>(null);
  const [unmatchedPartyHint, setUnmatchedPartyHint] = useState("");
  const [showCreateVendor, setShowCreateVendor] = useState(false);

  const [bootstrapping, setBootstrapping] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const docType: InboxDocumentType = item?.documentType || "vendorInvoice";
  const docMeta = DOC_TYPE_META[docType] || DOC_TYPE_META.vendorInvoice;
  const isCustomerDoc = docMeta.group === "Customer";
  const isVendorInvoice = docType === "vendorInvoice";
  const isCustomerInvoice = docType === "customerInvoice";
  const readOnly = item?.status === "Converted" || item?.status === "Discarded";

  const markDirty = () => setIsDirty(true);

  const loadVendors = useCallback(async (): Promise<PartyOption[]> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const list = await VendorService.GetVendorlist({ tenantid: storage?.tenantID || 0 });
    const mapped: PartyOption[] = (Array.isArray(list) ? list : [])
      .filter((v: any) => (v.status || "Active").toLowerCase() !== "inactive")
      .map((v: any) => ({
        id: v.vendor_id,
        name: v.company_name || "",
        code: v.vendorcode || "",
        address: v.address || "",
      }));
    setVendors(mapped);
    return mapped;
  }, []);

  const loadCustomers = useCallback(async (): Promise<PartyOption[]> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const list = await CustomerService.GetCustomerlist({ tenantid: storage?.tenantID || 0 });
    const mapped: PartyOption[] = (Array.isArray(list) ? list : [])
      .filter((c: any) => (c.status || "Active").toLowerCase() !== "inactive")
      .map((c: any) => ({
        id: c.customer_id,
        name: c.company_name || "",
        code: c.customercode || "",
        address: c.address || "",
      }));
    setCustomers(mapped);
    return mapped;
  }, []);

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
          setBillLines((prev) =>
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
        setLeftTab("email");

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

        const dt: InboxDocumentType = detail.documentType || "vendorInvoice";
        const customerSide =
          dt === "customerQuotation" || dt === "customerOrder" || dt === "customerInvoice";

        let parsed: VendorQuotationExtractionResult | null = null;
        if (detail.extractionJson) {
          try {
            parsed = JSON.parse(detail.extractionJson) as VendorQuotationExtractionResult;
          } catch {
            toast.info("The extracted data could not be read. Enter details manually.");
          }
        }

        if (dt === "vendorInvoice") {
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
          setTaxRate(Number(settings?.taxRate) || 0);

          const terms: PaymentTermOption[] = (settings?.paymentTerms || [])
            .filter((t: any) => t.isActive !== false)
            .map((t: any) => ({
              id: Number(t.id) || 0,
              name: t.name || "",
              days: Number(t.days) || 0,
            }))
            .filter((t: PaymentTermOption) => t.id > 0);
          setPaymentTerms(terms);

          let startLines: BillLineDraft[] = [emptyBillLine(companyExpenseId)];
          if (parsed) {
            const review = buildVendorInvoiceReview(
              parsed,
              vendorList.map((v) => ({
                vendor_id: v.id,
                company_name: v.name,
                vendorcode: v.code,
              }))
            );
            const mapped = applyDirectVendorInvoiceImport({
              currentLines: [],
              review,
              mode: "override",
              defaultAccountId: companyExpenseId,
              newLineKey,
            });

            startLines = mapped.lines;
            if (mapped.invoiceNo) setDocNumber(mapped.invoiceNo);
            const effectiveDate = mapped.invoiceDate || todayIsoInTenantTimezone();
            if (mapped.invoiceDate) setDocDate(mapped.invoiceDate);
            setDueDate(mapped.dueDate || addDaysToIsoDate(effectiveDate, 30));
            if (mapped.taxRate !== undefined) setTaxRate(mapped.taxRate);
            if (mapped.hasExtractedTax && mapped.taxAmount !== undefined) {
              setTaxAmountManual(true);
              setTaxAmount(mapped.taxAmount);
            }
            if (mapped.freightCharge !== undefined) setFreightCharge(mapped.freightCharge);
            setExtractedTotal(mapped.extractedTotal);

            if (review.matchedVendorId > 0) {
              setPartyId(review.matchedVendorId);
              const vendorExpenseId = await applyVendorDefaults(
                review.matchedVendorId,
                terms,
                companyExpenseId,
                { preserveDueDate: Boolean(mapped.dueDate), fromInvoiceDate: effectiveDate }
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
              setUnmatchedPartyHint(review.vendorNameHint || detail.extractedVendorName || "");
            }
          }
          if (!cancelled) setBillLines(startLines);
        } else if (customerSide) {
          const custList = await loadCustomers();
          if (cancelled) return;
          let startLines: TradeLineDraft[] = [emptyTradeLine()];
          if (parsed) {
            const review = buildCustomerDocumentReview(
              parsed,
              custList.map((c) => ({
                customer_id: c.id,
                company_name: c.name,
                customercode: c.code,
              }))
            );
            if (review.matchedCustomerId > 0) {
              setPartyId(review.matchedCustomerId);
            } else if (review.customerNameHint || detail.extractedVendorName) {
              setUnmatchedPartyHint(review.customerNameHint || detail.extractedVendorName || "");
            }
            const effectiveDate = review.orderDate || todayIsoInTenantTimezone();
            if (review.orderDate) setDocDate(review.orderDate);
            setDueDate(review.dueDate || addDaysToIsoDate(effectiveDate, 30));
            setDocNumber(
              (parsed.invoiceNumber || parsed.poNumber || parsed.quotationNumber || review.customerPoNumber || "").trim()
            );
            setRefNumber((parsed.quotationNumber || review.customerPoNumber || "").trim());
            if (typeof parsed.taxRate === "number") setTaxRate(parsed.taxRate);
            if (typeof parsed.taxAmount === "number") {
              setTaxAmountManual(true);
              setTaxAmount(parsed.taxAmount);
            }
            if (typeof parsed.freightCharge === "number") setFreightCharge(parsed.freightCharge);
            if (typeof parsed.totalAmount === "number" && parsed.totalAmount > 0) {
              setExtractedTotal(parsed.totalAmount);
            }
            const mapped = (review.lines || [])
              .filter((l) => l.included)
              .map<TradeLineDraft>((l) => ({
                key: newLineKey(),
                partNo: l.partNo || "",
                partName: l.partName || l.notes || "",
                qty: String(l.qtyOrdered > 0 ? l.qtyOrdered : 1),
                unit: l.unit || "EA",
                unitPrice: l.unitPrice > 0 ? String(l.unitPrice) : "",
                discount: l.discount > 0 ? String(l.discount) : "0",
                notes: l.notes || "",
              }));
            if (mapped.length > 0) startLines = mapped;
          }
          if (!cancelled) setTradeLines(startLines);
        } else {
          // vendorQuotation or vendorOrder
          const vendorList = await loadVendors();
          if (cancelled) return;
          let startLines: TradeLineDraft[] = [emptyTradeLine()];
          if (parsed) {
            const candidates = vendorList.map((v) => ({
              vendor_id: v.id,
              company_name: v.name,
              vendorcode: v.code,
            }));
            const review =
              dt === "vendorOrder"
                ? buildVendorOrderReview(parsed, candidates)
                : buildVendorQuotationReview(parsed, candidates);

            if (review.matchedVendorId > 0) {
              setPartyId(review.matchedVendorId);
            } else if (review.extractedVendorDraft || review.vendorNameHint) {
              setUnmatchedVendorDraft(review.extractedVendorDraft);
              setUnmatchedPartyHint(review.vendorNameHint || detail.extractedVendorName || "");
            }
            const effectiveDate = review.orderDate || todayIsoInTenantTimezone();
            if (review.orderDate) setDocDate(review.orderDate);
            setDueDate(review.dueDate || addDaysToIsoDate(effectiveDate, 30));
            setDocNumber((parsed.poNumber || parsed.quotationNumber || review.vendorPoNumber || "").trim());
            setRefNumber((parsed.quotationNumber || parsed.poNumber || "").trim());
            if (typeof parsed.totalAmount === "number" && parsed.totalAmount > 0) {
              setExtractedTotal(parsed.totalAmount);
            }
            const mapped = (review.lines || [])
              .filter((l) => l.included)
              .map<TradeLineDraft>((l) => ({
                key: newLineKey(),
                partNo: l.partNo || "",
                partName: l.partName || l.notes || "",
                qty: String(l.qtyOrdered > 0 ? l.qtyOrdered : 1),
                unit: l.unit || "EA",
                unitPrice: l.unitPrice > 0 ? String(l.unitPrice) : "",
                discount: l.discount > 0 ? String(l.discount) : "0",
                notes: l.notes || "",
              }));
            if (mapped.length > 0) startLines = mapped;
          }
          if (!cancelled) setTradeLines(startLines);
        }
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
  }, [itemId, loadVendors, loadCustomers, applyVendorDefaults]);

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

  const billSubtotal = useMemo(
    () =>
      Math.round(
        billLines.reduce((sum, line) => {
          const n = parseFloat(line.amount);
          return sum + (Number.isFinite(n) ? n : 0);
        }, 0) * 100
      ) / 100,
    [billLines]
  );

  const tradeSubtotal = useMemo(
    () => Math.round(tradeLines.reduce((sum, line) => sum + tradeLineTotal(line), 0) * 100) / 100,
    [tradeLines]
  );

  useEffect(() => {
    if (!isVendorInvoice || taxAmountManual) return;
    setTaxAmount(Math.round(billSubtotal * (taxRate / 100) * 100) / 100);
  }, [isVendorInvoice, billSubtotal, taxRate, taxAmountManual]);

  const billTotal = useMemo(
    () => Math.round((billSubtotal + taxAmount + (freightCharge || 0)) * 100) / 100,
    [billSubtotal, taxAmount, freightCharge]
  );

  const applyPaymentTerm = (termId: number, fromInvoiceDate = docDate) => {
    setPaymentTermId(termId);
    if (termId <= 0) return;
    const term = paymentTerms.find((t) => t.id === termId);
    if (term) setDueDate(addDaysToIsoDate(fromInvoiceDate, term.days));
  };

  const handlePartyChange = async (nextId: number) => {
    markDirty();
    setPartyId(nextId);
    setErrors((prev) => ({ ...prev, partyId: "" }));
    if (nextId > 0) {
      setUnmatchedVendorDraft(null);
      setUnmatchedPartyHint("");
    }
    if (isVendorInvoice) {
      await applyVendorDefaults(nextId, paymentTerms, defaultExpenseAccountId, {
        fromInvoiceDate: docDate,
      });
    }
  };

  const updateBillLine = (key: string, field: keyof BillLineDraft, value: string | number) => {
    markDirty();
    setBillLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, [field]: value } : line))
    );
  };

  const addBillLine = () => {
    markDirty();
    const fallbackAccount =
      billLines[0]?.accountId || defaultExpenseAccountId || expenseAccounts[0]?.accountID || 0;
    setBillLines((prev) => [...prev, emptyBillLine(fallbackAccount)]);
  };

  const removeBillLine = (key: string) => {
    markDirty();
    setBillLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  };

  const updateTradeLine = (key: string, field: keyof TradeLineDraft, value: string) => {
    markDirty();
    setTradeLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, [field]: value } : line))
    );
  };

  const addTradeLine = () => {
    markDirty();
    setTradeLines((prev) => [...prev, emptyTradeLine()]);
  };

  const removeTradeLine = (key: string) => {
    markDirty();
    setTradeLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (isCustomerInvoice) return true;

    if (partyId <= 0) {
      next.partyId = isCustomerDoc ? "Customer is required" : "Vendor is required";
    }
    if (!docDate) next.docDate = "Date is required";
    if (isVendorInvoice && !dueDate) next.dueDate = "Due date is required";
    if (docDate && dueDate && dueDate < docDate) {
      next.dueDate = "Due date cannot be before document date";
    }

    if (isVendorInvoice) {
      const validLines = billLines.filter(
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
    } else {
      const validLines = tradeLines.filter(
        (l) => l.partName.trim() || l.partNo.trim()
      );
      if (validLines.length === 0) {
        next.lines = "Add at least one line item";
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

    setSaving(true);
    let createdId = 0;
    let successMsg = `${docMeta.label} created`;

    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const userId = storage?.userId || 0;
      const userToken = storage?.userToken || 0;
      const party = (isCustomerDoc ? customers : vendors).find((p) => p.id === partyId);

      if (docType === "vendorInvoice") {
        const lineItems = billLines
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
          vendorId: partyId,
          vendorCode: party?.code,
          vendorName: party?.name,
          invoiceNo: docNumber.trim() || undefined,
          locationId: item.locationId > 0 ? item.locationId : undefined,
          invoiceDate: docDate,
          dueDate,
          paymentTermId: paymentTermId > 0 ? paymentTermId : undefined,
          notes: notes.trim() || undefined,
          taxRate,
          taxAmount,
          freightCharge: freightCharge || 0,
          lineItems,
        };

        const created = await VendorInvoiceService.CreateDirectVendorInvoice(request);
        if (!created) throw new Error("Failed to create vendor invoice");
        createdId = created.id;
        successMsg =
          created.message || `Vendor invoice ${created.invoiceNumber} created and posted to AP`;
      } else if (docType === "vendorQuotation") {
        const details: QuotationDetailReq[] = tradeLines
          .filter((l) => l.partName.trim() || l.partNo.trim())
          .map((l, idx) => ({
            ID: 0,
            ItemNo: idx + 1,
            PartName: l.partName.trim() || l.partNo.trim(),
            PartNo: l.partNo.trim(),
            DueDate: dueDate || docDate,
            JobNumber: "",
            JobDesc: "",
            QtyOrdered: Math.max(1, parseFloat(l.qty) || 1),
            Unit: l.unit.trim() || "EA",
            UnitPrice: Math.max(0, parseFloat(l.unitPrice) || 0),
            JobPriority: 0,
            Discount: Math.max(0, parseFloat(l.discount) || 0),
            DiscountType: "Percent",
            LeadTime: "",
            Notes: l.notes.trim(),
          }));

        const created = await QuotationService.SaveVendorQuotation({
          OrderID: 0,
          Tenantid: tenantID,
          VendorID: partyId,
          VendorCode: party?.code || "",
          PONumber: 0,
          VendorName: party?.name || "",
          Address: party?.address || "",
          VendorPoNumber: docNumber.trim(),
          OrderDate: docDate,
          TotalAmount: tradeSubtotal,
          UserId: userId,
          UserToken: userToken,
          Status: "Open",
          ShippingInstructions: shippingInstructions.trim(),
          ExternalVendorPO: docNumber.trim(),
          BuyerName: "",
          VendorRefNo: refNumber.trim(),
          LocationId: item.locationId > 0 ? item.locationId : undefined,
          AdditionalNotes: notes.trim(),
          Details: details,
        });
        createdId = created.id;
        successMsg = created.message || "Vendor quotation created";
      } else if (docType === "vendorOrder") {
        const details: VendorOrderDetailReq[] = tradeLines
          .filter((l) => l.partName.trim() || l.partNo.trim())
          .map((l, idx) => ({
            ID: 0,
            ItemNo: idx + 1,
            PartName: l.partName.trim() || l.partNo.trim(),
            PartNo: l.partNo.trim(),
            DueDate: dueDate || docDate,
            JobNumber: "",
            JobDesc: "",
            QtyOrdered: Math.max(1, parseFloat(l.qty) || 1),
            Unit: l.unit.trim() || "EA",
            UnitPrice: Math.max(0, parseFloat(l.unitPrice) || 0),
            JobPriority: 0,
            Discount: Math.max(0, parseFloat(l.discount) || 0),
            DiscountType: "Percent",
            LeadTime: "",
            Notes: l.notes.trim(),
            ShippedQty: 0,
            ShippingStatus: "Pending",
            InvoicedQty: 0,
            InvoiceStatus: "Uninvoiced",
          }));

        const created = await VendorOrderService.SaveVendorOrder({
          OrderID: 0,
          Tenantid: tenantID,
          VendorID: partyId,
          VendorCode: party?.code || "",
          PONumber: 0,
          VendorName: party?.name || "",
          Address: party?.address || "",
          VendorPoNumber: docNumber.trim(),
          OrderDate: docDate,
          TotalAmount: tradeSubtotal,
          UserId: userId,
          UserToken: userToken,
          Status: "Open",
          ShippingInstructions: shippingInstructions.trim(),
          ExternalVendorPO: docNumber.trim(),
          BuyerName: "",
          VendorRefNo: refNumber.trim(),
          OrderType: "Vendor",
          MaterialType: materialType,
          QuotationId: 0,
          QuotationNo: "",
          LocationId: item.locationId > 0 ? item.locationId : undefined,
          AdditionalNotes: notes.trim(),
          Details: details,
        });
        if (!created?.id) throw new Error("Failed to create vendor order");
        createdId = created.id;
        successMsg = created.message || "Vendor order created";
      } else if (docType === "customerQuotation") {
        const details: QuotationDetailReq[] = tradeLines
          .filter((l) => l.partName.trim() || l.partNo.trim())
          .map((l, idx) => ({
            ID: 0,
            ItemNo: idx + 1,
            PartName: l.partName.trim() || l.partNo.trim(),
            PartNo: l.partNo.trim(),
            DueDate: dueDate || docDate,
            JobNumber: "",
            JobDesc: "",
            QtyOrdered: Math.max(1, parseFloat(l.qty) || 1),
            Unit: l.unit.trim() || "EA",
            UnitPrice: Math.max(0, parseFloat(l.unitPrice) || 0),
            JobPriority: 0,
            Discount: Math.max(0, parseFloat(l.discount) || 0),
            DiscountType: "Percent",
            LeadTime: "",
            Notes: l.notes.trim(),
          }));

        const created = await QuotationService.SaveQuotation({
          OrderID: 0,
          Tenantid: tenantID,
          CustomerID: partyId,
          CustomerCode: party?.code || "",
          PONumber: 0,
          CustomerName: party?.name || "",
          Address: party?.address || "",
          CustomerPoNumber: docNumber.trim(),
          OrderDate: docDate,
          TotalAmount: tradeSubtotal,
          UserId: userId,
          UserToken: userToken,
          Status: "Open",
          ShippingInstructions: shippingInstructions.trim(),
          ExternalCustomerPO: docNumber.trim(),
          BuyerName: "",
          CustomerRefNo: refNumber.trim(),
          LocationId: item.locationId > 0 ? item.locationId : undefined,
          Details: details,
        });
        createdId = created.id;
        successMsg = created.message || "Customer quotation created";
      } else if (docType === "customerOrder") {
        const details: OrderDetailReq[] = tradeLines
          .filter((l) => l.partName.trim() || l.partNo.trim())
          .map((l, idx) => ({
            ID: 0,
            ItemNo: idx + 1,
            PartName: l.partName.trim() || l.partNo.trim(),
            PartNo: l.partNo.trim(),
            DueDate: dueDate || docDate,
            JobNumber: "",
            JobDesc: "",
            QtyOrdered: Math.max(1, parseFloat(l.qty) || 1),
            Unit: l.unit.trim() || "EA",
            UnitPrice: Math.max(0, parseFloat(l.unitPrice) || 0),
            JobPriority: 0,
            Discount: Math.max(0, parseFloat(l.discount) || 0),
            DiscountType: "Percent",
            LeadTime: "",
            Notes: l.notes.trim(),
            ShippedQty: 0,
            ShippingStatus: "Pending",
            InvoicedQty: 0,
            InvoiceStatus: "Uninvoiced",
          }));

        const created = await OrderService.SaveOrder({
          OrderID: 0,
          Tenantid: tenantID,
          CustomerID: partyId,
          CustomerCode: party?.code || "",
          PONumber: 0,
          CustomerName: party?.name || "",
          Address: party?.address || "",
          CustomerPoNumber: docNumber.trim(),
          OrderDate: docDate,
          TotalAmount: tradeSubtotal,
          UserId: userId,
          UserToken: userToken,
          Status: "Open",
          ShippingInstructions: shippingInstructions.trim(),
          ExternalCustomerPO: docNumber.trim(),
          BuyerName: "",
          LocationId: item.locationId > 0 ? item.locationId : undefined,
          Details: details,
        });
        createdId = created.id;
        successMsg = created.message || "Customer order created";
      } else if (docType === "customerInvoice") {
        createdId = 0;
        successMsg = "Customer invoice marked as reviewed";
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.message || `Failed to create ${docMeta.label}`);
      setSaving(false);
      return;
    }

    try {
      await InvoiceInboxService.MarkConverted(item.id, createdId);
      toast.success(successMsg);
    } catch (error: any) {
      toast.warning(
        `${successMsg}, but the inbox item could not be marked converted. ${error?.message || ""}`.trim()
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
        text: `Extraction failed: ${item.failureReason || "unknown error"}. You can retry, or enter the details manually.`,
      };
    }
    if (item.status === "New" || item.status === "Extracting") {
      return {
        tone: "info",
        text: "This PDF is still being read. Close and reopen in a moment to get the prefilled fields, or enter them manually.",
      };
    }
    if (item.status === "NoAttachment") {
      return {
        tone: "warning",
        text: "This email had no PDF attachment. You can still enter the details manually from the email text.",
      };
    }
    return null;
  })();

  const submitLabel = (() => {
    if (saving) return "Saving…";
    switch (docType) {
      case "customerQuotation":
        return "Create Customer Quotation";
      case "customerOrder":
        return "Create Customer Order";
      case "customerInvoice":
        return "Mark as Reviewed";
      case "vendorQuotation":
        return "Create Vendor Quotation";
      case "vendorOrder":
        return "Create Vendor Order";
      case "vendorInvoice":
      default:
        return "Create Vendor Invoice";
    }
  })();

  const convertedId = item?.convertedRecordId || item?.vendorInvoiceId || 0;
  const partyOptions = isCustomerDoc ? customers : vendors;

  return (
    <div className="slideout-overlay" onClick={onBackdropClick(handleDismiss)}>
      <div
        className="form-card direct-vendor-invoice-slideout invoice-inbox-review"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="form-header">
          <div>
            <div className="inbox-review-title-row">
              <h2>Review {docMeta.label}</h2>
              <span className={`inbox-type-badge ${docMeta.tone}`}>{docMeta.short}</span>
            </div>
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
              {/* LEFT PANE: Email tab first, then Attachment tab — both prominently highlighted */}
              <div className="inbox-review-left">
                <div className="inbox-review-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={leftTab === "email"}
                    className={`inbox-tab-btn ${leftTab === "email" ? "active" : ""}`}
                    onClick={() => setLeftTab("email")}
                  >
                    <FontAwesomeIcon icon={faEnvelope} />
                    <span>Email</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={leftTab === "pdf"}
                    className={`inbox-tab-btn ${leftTab === "pdf" ? "active" : ""}`}
                    disabled={!item?.hasFile}
                    onClick={() => setLeftTab("pdf")}
                    title={item?.fileName || "PDF Attachment"}
                  >
                    <FontAwesomeIcon icon={faFilePdf} />
                    <span className="inbox-tab-label">Attachment</span>
                  </button>
                </div>

                <div className="inbox-review-pane">
                  {leftTab === "email" ? (
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
                  ) : pdfUrl ? (
                    <iframe title="Attachment PDF" src={pdfUrl} className="inbox-review-frame" />
                  ) : (
                    <div className="inbox-review-empty">
                      {item?.hasFile ? "Loading PDF…" : "No PDF attachment"}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT PANE: Dynamic fields based on fetched document type */}
              <div className="tab-content inbox-review-right" style={{ display: "block" }}>
                {readOnly && item ? (
                  <div className="inbox-review-readonly">
                    {item.status === "Converted" ? (
                      <>
                        <p>This email was already converted to a {docMeta.label}.</p>
                        {convertedId > 0 ? (
                          <button
                            type="button"
                            className="btn-submit"
                            onClick={() => history.push(convertedRouteFor(docType, convertedId))}
                          >
                            Open {docMeta.label}
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
                        Prefilled from the PDF ({docMeta.label}). Verify every field before saving.
                      </div>
                    )}

                    {!isCustomerDoc && unmatchedVendorDraft && partyId <= 0 && (
                      <div className="direct-extraction-vendor-miss" role="status">
                        <div className="direct-extraction-vendor-miss-text">
                          Vendor{" "}
                          <strong>
                            {unmatchedPartyHint || unmatchedVendorDraft.company_name || "from PDF"}
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
                              setUnmatchedPartyHint("");
                            }}
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )}

                    {isCustomerDoc && unmatchedPartyHint && partyId <= 0 && (
                      <div className="direct-extraction-vendor-miss" role="status">
                        <div className="direct-extraction-vendor-miss-text">
                          Customer <strong>{unmatchedPartyHint}</strong> was not matched in Customer
                          Master. Select a customer below.
                        </div>
                        <button
                          type="button"
                          className="btn-cancel"
                          onClick={() => setUnmatchedPartyHint("")}
                        >
                          Dismiss
                        </button>
                      </div>
                    )}

                    {isCustomerInvoice && (
                      <div className="inbox-review-notice info" role="status">
                        Customer Invoices are billed from shipped Customer Orders in ERPV2. Review
                        the extracted details below, then open Customer Orders or mark this email as
                        reviewed.
                        <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
                          <button
                            type="button"
                            className="btn-cancel"
                            onClick={() => history.push("/orders/customer")}
                          >
                            Open Customer Orders
                          </button>
                          <button
                            type="button"
                            className="btn-cancel"
                            onClick={() => history.push("/orders/customer-invoices")}
                          >
                            Open Customer Invoices
                          </button>
                        </div>
                      </div>
                    )}

                    {isVendorInvoice ? (
                      /* =================== VENDOR INVOICE FORM =================== */
                      <>
                        {extractedTotal !== null && Math.abs(extractedTotal - billTotal) > 0.01 && (
                          <div className="direct-extraction-variance" role="status">
                            <div className="direct-extraction-variance-text">
                              PDF total is <strong>{formatCurrency(extractedTotal)}</strong>, but the
                              form total is <strong>{formatCurrency(billTotal)}</strong>. Review line
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
                              className={`form-input ${errors.partyId ? "error" : ""}`}
                              value={partyId || ""}
                              disabled={!canAdd}
                              onChange={(e) => handlePartyChange(Number(e.target.value) || 0)}
                            >
                              <option value="">Select vendor…</option>
                              {vendors.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.name}
                                  {v.code ? ` (${v.code})` : ""}
                                </option>
                              ))}
                            </select>
                            {errors.partyId && <span className="error-message">{errors.partyId}</span>}
                          </div>
                          <div className="form-group">
                            <label htmlFor="inboxInvoiceNo">Vendor Invoice #</label>
                            <input
                              id="inboxInvoiceNo"
                              type="text"
                              className="form-input"
                              placeholder="Vendor's bill number"
                              value={docNumber}
                              disabled={!canAdd}
                              onChange={(e) => {
                                markDirty();
                                setDocNumber(e.target.value);
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
                              className={`form-input ${errors.docDate ? "error" : ""}`}
                              value={docDate}
                              disabled={!canAdd}
                              onChange={(e) => {
                                markDirty();
                                const next = e.target.value;
                                setDocDate(next);
                                if (paymentTermId > 0) applyPaymentTerm(paymentTermId, next);
                                setErrors((prev) => ({ ...prev, docDate: "" }));
                              }}
                            />
                            {errors.docDate && <span className="error-message">{errors.docDate}</span>}
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
                            <button type="button" className="btn-add-line" onClick={addBillLine}>
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
                              {billLines.map((line) => (
                                <tr key={line.key}>
                                  <td>
                                    <input
                                      type="text"
                                      className="form-input"
                                      placeholder="Description"
                                      value={line.description}
                                      disabled={!canAdd}
                                      onChange={(e) =>
                                        updateBillLine(line.key, "description", e.target.value)
                                      }
                                    />
                                  </td>
                                  <td>
                                    <select
                                      className="form-input"
                                      value={line.accountId || ""}
                                      disabled={!canAdd}
                                      onChange={(e) =>
                                        updateBillLine(
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
                                      disabled={!canAdd}
                                      onChange={(e) =>
                                        updateBillLine(line.key, "amount", e.target.value)
                                      }
                                    />
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      className="btn-remove-line"
                                      title="Remove line"
                                      disabled={billLines.length <= 1 || !canAdd}
                                      onClick={() => removeBillLine(line.key)}
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
                              <strong>{formatCurrency(billSubtotal)}</strong>
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
                              <strong>{formatCurrency(billTotal)}</strong>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      /* =================== CQ / CO / CI / VQ / VO FORM =================== */
                      <>
                        {extractedTotal !== null &&
                          Math.abs(extractedTotal - tradeSubtotal) > 0.01 && (
                            <div className="direct-extraction-variance" role="status">
                              <div className="direct-extraction-variance-text">
                                PDF total is <strong>{formatCurrency(extractedTotal)}</strong>, and
                                the line items sum to{" "}
                                <strong>{formatCurrency(tradeSubtotal)}</strong>.
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
                            <label htmlFor="inboxParty">
                              {isCustomerDoc ? "Customer" : "Vendor"}{" "}
                              {!isCustomerInvoice && <span className="required">*</span>}
                            </label>
                            <select
                              id="inboxParty"
                              className={`form-input ${errors.partyId ? "error" : ""}`}
                              value={partyId || ""}
                              disabled={!canAdd || isCustomerInvoice}
                              onChange={(e) => handlePartyChange(Number(e.target.value) || 0)}
                            >
                              <option value="">
                                {isCustomerDoc ? "Select customer…" : "Select vendor…"}
                              </option>
                              {partyOptions.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                  {p.code ? ` (${p.code})` : ""}
                                </option>
                              ))}
                            </select>
                            {errors.partyId && <span className="error-message">{errors.partyId}</span>}
                          </div>

                          <div className="form-group">
                            <label htmlFor="inboxDocNo">
                              {docType === "customerInvoice"
                                ? "Invoice #"
                                : isCustomerDoc
                                ? "Customer PO / Ref #"
                                : "Vendor PO / Quote #"}
                            </label>
                            <input
                              id="inboxDocNo"
                              type="text"
                              className="form-input"
                              placeholder="Reference number"
                              value={docNumber}
                              disabled={!canAdd || isCustomerInvoice}
                              onChange={(e) => {
                                markDirty();
                                setDocNumber(e.target.value);
                              }}
                            />
                          </div>
                        </div>

                        <div className="form-row">
                          <div className="form-group">
                            <label htmlFor="inboxDocDate">
                              {docType === "customerQuotation" || docType === "vendorQuotation"
                                ? "Quotation Date"
                                : docType === "customerInvoice"
                                ? "Invoice Date"
                                : "Order Date"}{" "}
                              {!isCustomerInvoice && <span className="required">*</span>}
                            </label>
                            <input
                              id="inboxDocDate"
                              type="date"
                              className={`form-input ${errors.docDate ? "error" : ""}`}
                              value={docDate}
                              disabled={!canAdd || isCustomerInvoice}
                              onChange={(e) => {
                                markDirty();
                                setDocDate(e.target.value);
                                setErrors((prev) => ({ ...prev, docDate: "" }));
                              }}
                            />
                            {errors.docDate && <span className="error-message">{errors.docDate}</span>}
                          </div>

                          <div className="form-group">
                            <label htmlFor="inboxTradeDueDate">Due Date</label>
                            <input
                              id="inboxTradeDueDate"
                              type="date"
                              className={`form-input ${errors.dueDate ? "error" : ""}`}
                              value={dueDate}
                              disabled={!canAdd || isCustomerInvoice}
                              onChange={(e) => {
                                markDirty();
                                setDueDate(e.target.value);
                                setErrors((prev) => ({ ...prev, dueDate: "" }));
                              }}
                            />
                            {errors.dueDate && <span className="error-message">{errors.dueDate}</span>}
                          </div>

                          {docType === "vendorOrder" ? (
                            <div className="form-group">
                              <label htmlFor="inboxMaterialType">Order Type</label>
                              <select
                                id="inboxMaterialType"
                                className="form-input"
                                value={materialType}
                                disabled={!canAdd}
                                onChange={(e) => {
                                  markDirty();
                                  setMaterialType(e.target.value);
                                }}
                              >
                                <option value="Material">Material</option>
                                <option value="Service">Service</option>
                              </select>
                            </div>
                          ) : (
                            <div className="form-group">
                              <label htmlFor="inboxRefNo">
                                {isCustomerDoc ? "Customer Ref #" : "Vendor Ref #"}
                              </label>
                              <input
                                id="inboxRefNo"
                                type="text"
                                className="form-input"
                                placeholder="Optional reference"
                                value={refNumber}
                                disabled={!canAdd || isCustomerInvoice}
                                onChange={(e) => {
                                  markDirty();
                                  setRefNumber(e.target.value);
                                }}
                              />
                            </div>
                          )}
                        </div>

                        {!isCustomerInvoice && (
                          <div className="form-row">
                            <div className="form-group">
                              <label htmlFor="inboxShipping">Shipping Instructions</label>
                              <input
                                id="inboxShipping"
                                type="text"
                                className="form-input"
                                placeholder="Optional shipping instructions"
                                value={shippingInstructions}
                                disabled={!canAdd}
                                onChange={(e) => {
                                  markDirty();
                                  setShippingInstructions(e.target.value);
                                }}
                              />
                            </div>
                            {!isCustomerDoc && (
                              <div className="form-group">
                                <label htmlFor="inboxTradeNotes">Notes</label>
                                <input
                                  id="inboxTradeNotes"
                                  type="text"
                                  className="form-input"
                                  placeholder="Optional notes"
                                  value={notes}
                                  disabled={!canAdd}
                                  onChange={(e) => {
                                    markDirty();
                                    setNotes(e.target.value);
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        )}

                        <div className="direct-lines-header">
                          <h3>Line Items</h3>
                          {canAdd && !isCustomerInvoice && (
                            <button type="button" className="btn-add-line" onClick={addTradeLine}>
                              + Add line
                            </button>
                          )}
                        </div>
                        {errors.lines && <span className="error-message">{errors.lines}</span>}

                        <div className="direct-lines-table-wrap">
                          <table className="direct-lines-table">
                            <thead>
                              <tr>
                                <th style={{ width: "16%" }}>Part #</th>
                                <th style={{ width: "30%" }}>Description / Part</th>
                                <th style={{ width: "11%" }}>Qty</th>
                                <th style={{ width: "10%" }}>Unit</th>
                                <th style={{ width: "14%" }}>Unit Price</th>
                                <th style={{ width: "13%", textAlign: "right" }}>Total</th>
                                {!isCustomerInvoice && <th style={{ width: "6%" }} />}
                              </tr>
                            </thead>
                            <tbody>
                              {tradeLines.map((line) => (
                                <tr key={line.key}>
                                  <td>
                                    <input
                                      type="text"
                                      className="form-input"
                                      placeholder="Part #"
                                      value={line.partNo}
                                      disabled={!canAdd || isCustomerInvoice}
                                      onChange={(e) =>
                                        updateTradeLine(line.key, "partNo", e.target.value)
                                      }
                                    />
                                  </td>
                                  <td>
                                    <input
                                      type="text"
                                      className="form-input"
                                      placeholder="Item / Part name"
                                      value={line.partName}
                                      disabled={!canAdd || isCustomerInvoice}
                                      onChange={(e) =>
                                        updateTradeLine(line.key, "partName", e.target.value)
                                      }
                                    />
                                  </td>
                                  <td>
                                    <input
                                      type="number"
                                      className="form-input amount-input"
                                      min="0"
                                      step="any"
                                      value={line.qty}
                                      disabled={!canAdd || isCustomerInvoice}
                                      onChange={(e) =>
                                        updateTradeLine(line.key, "qty", e.target.value)
                                      }
                                    />
                                  </td>
                                  <td>
                                    <input
                                      type="text"
                                      className="form-input"
                                      value={line.unit}
                                      disabled={!canAdd || isCustomerInvoice}
                                      onChange={(e) =>
                                        updateTradeLine(line.key, "unit", e.target.value)
                                      }
                                    />
                                  </td>
                                  <td>
                                    <input
                                      type="number"
                                      className="form-input amount-input"
                                      min="0"
                                      step="0.01"
                                      placeholder="0.00"
                                      value={line.unitPrice}
                                      disabled={!canAdd || isCustomerInvoice}
                                      onChange={(e) =>
                                        updateTradeLine(line.key, "unitPrice", e.target.value)
                                      }
                                    />
                                  </td>
                                  <td style={{ textAlign: "right", fontWeight: 600 }}>
                                    {formatCurrency(tradeLineTotal(line))}
                                  </td>
                                  {!isCustomerInvoice && (
                                    <td>
                                      <button
                                        type="button"
                                        className="btn-remove-line"
                                        title="Remove line"
                                        disabled={tradeLines.length <= 1 || !canAdd}
                                        onClick={() => removeTradeLine(line.key)}
                                      >
                                        ×
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="inbox-trade-summary">
                          <div className="direct-totals-summary">
                            <div className="direct-total-row" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
                              <span>Total</span>
                              <strong>{formatCurrency(tradeSubtotal)}</strong>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
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
              {!readOnly &&
                canAdd &&
                item?.hasFile &&
                (item.status === "Failed" || item.status === "Extracted") && (
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
                  {submitLabel}
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
                await handlePartyChange(id);
                setUnmatchedVendorDraft(null);
                setUnmatchedPartyHint("");
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
