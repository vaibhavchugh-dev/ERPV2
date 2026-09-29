import api from "./apiClient";
import { AuthService } from "./authService";

async function blobErrorMessage(error: unknown, fallback: string): Promise<string> {
  const ax = error as { response?: { status?: number; data?: unknown }; message?: string };
  const data = ax?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as {
        error?: string | { message?: string };
        message?: string;
      };
      if (typeof parsed.error === "string" && parsed.error) return parsed.error;
      if (parsed.error && typeof parsed.error === "object" && parsed.error.message) {
        return parsed.error.message;
      }
      if (parsed.message) return parsed.message;
    } catch {
      /* not JSON */
    }
  }
  return ax?.message || fallback;
}

async function fetchPdf(path: string, params: Record<string, number>, fallback: string): Promise<Blob> {
  const locationId = AuthService.getLocationId();
  try {
    const response = await api.get(path, {
      params: {
        ...params,
        tenantId: AuthService.getTenantId(),
        ...(locationId > 0 ? { locationId } : {}),
      },
      responseType: "blob",
    });
    return response.data as Blob;
  } catch (error) {
    throw new Error(await blobErrorMessage(error, fallback));
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Opens the OS share sheet (Print / Save to Files on iOS & Android) when files can be
 * shared, otherwise downloads the PDF. Share needs a fresh user gesture, so fall back
 * to download if the browser rejects it after the fetch.
 */
async function deliverPdf(blob: Blob, fileName: string, title: string) {
  const file = new File([blob], fileName, { type: "application/pdf" });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
  };
  if (nav.canShare?.({ files: [file] }) && typeof nav.share === "function") {
    try {
      await nav.share({ files: [file], title });
      return;
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
    }
  }
  downloadBlob(blob, fileName);
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

export class PdfService {
  /** Same document as Flow's NCR Print (Pdf/GenerateNCR). */
  static async printNcr(ncrId: number, ncrNumber?: string): Promise<void> {
    const blob = await fetchPdf("/Pdf/GenerateNCR", { ncrId }, "Failed to generate NCR PDF");
    const label = ncrNumber || `NCR-${ncrId}`;
    await deliverPdf(blob, `${label}_${today()}.pdf`, label);
  }

  /** Same document as Flow's Job Order Print (Pdf/GenerateJobOrder). */
  static async printJobOrder(jobOrderId: number, jobLabel: string): Promise<void> {
    const blob = await fetchPdf(
      "/Pdf/GenerateJobOrder",
      { jobOrderId },
      "Failed to generate job order PDF"
    );
    await deliverPdf(blob, `JobOrder_${jobLabel}_${today()}.pdf`, jobLabel);
  }
}
