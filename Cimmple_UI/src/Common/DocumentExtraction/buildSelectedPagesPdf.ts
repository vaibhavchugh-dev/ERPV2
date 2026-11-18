import { jsPDF } from "jspdf";
import { pdfjs } from "react-pdf";

/**
 * Rebuild a PDF containing only the selected pages (1-based).
 * When selectedPages is empty, returns the original file unchanged.
 */
export async function buildSelectedPagesPdf(
  sourceFile: File,
  selectedPages: number[]
): Promise<File> {
  if (!sourceFile) {
    throw new Error("No PDF file provided.");
  }

  if (!selectedPages || selectedPages.length === 0) {
    return sourceFile;
  }

  const arrayBuffer = await sourceFile.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdfDocument = await loadingTask.promise;

  const pagesToRender = selectedPages
    .map((p) => Number(p))
    .filter((p) => Number.isFinite(p) && p >= 1 && p <= pdfDocument.numPages)
    .sort((a, b) => a - b);

  if (pagesToRender.length === 0) {
    return sourceFile;
  }

  // If every page is selected, skip the expensive rebuild.
  if (pagesToRender.length === pdfDocument.numPages) {
    return sourceFile;
  }

  let outputDoc: jsPDF | null = null;
  let outputPageIndex = 0;

  for (const pageNumber of pagesToRender) {
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Unable to render selected PDF pages.");
    }

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: context,
      viewport,
      canvas,
    } as any).promise;

    const imageData = canvas.toDataURL("image/jpeg", 0.92);
    const orientation = viewport.width >= viewport.height ? "landscape" : "portrait";
    const pageWidth = Math.ceil(viewport.width);
    const pageHeight = Math.ceil(viewport.height);

    if (!outputDoc) {
      outputDoc = new jsPDF({
        orientation,
        unit: "px",
        format: [pageWidth, pageHeight],
      });
    } else {
      outputDoc.addPage([pageWidth, pageHeight], orientation);
    }

    outputPageIndex += 1;
    outputDoc.setPage(outputPageIndex);
    outputDoc.addImage(imageData, "JPEG", 0, 0, pageWidth, pageHeight);

    canvas.width = 0;
    canvas.height = 0;
  }

  if (!outputDoc) {
    return sourceFile;
  }

  const pdfBlob = outputDoc.output("blob");
  const baseName = sourceFile.name?.replace(/\.pdf$/i, "") || "vendor-quotation";
  return new File([pdfBlob], `${baseName}-pages.pdf`, {
    type: "application/pdf",
  });
}

/**
 * Parse a page-range string like "1-3, 7, 10-12" into sorted unique 1-based page numbers.
 */
export function parsePageRangeInput(input: string, maxPages: number): number[] {
  if (!input?.trim() || maxPages <= 0) return [];

  const result = new Set<number>();
  const parts = input.split(/[,;\s]+/).map((p) => p.trim()).filter(Boolean);

  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (rangeMatch) {
      let start = Number(rangeMatch[1]);
      let end = Number(rangeMatch[2]);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      if (start > end) [start, end] = [end, start];
      for (let p = start; p <= end; p++) {
        if (p >= 1 && p <= maxPages) result.add(p);
      }
      continue;
    }

    const single = Number(part);
    if (Number.isFinite(single) && single >= 1 && single <= maxPages) {
      result.add(single);
    }
  }

  return Array.from(result).sort((a, b) => a - b);
}

export function formatPageSelectionSummary(
  selectedPages: number[],
  pageCount: number
): string {
  if (!pageCount) return "No pages";
  if (!selectedPages || selectedPages.length === 0) {
    return `All ${pageCount} page${pageCount === 1 ? "" : "s"}`;
  }
  return `${selectedPages.length} of ${pageCount} page${pageCount === 1 ? "" : "s"} selected`;
}
