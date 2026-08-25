import type { AxiosProgressEvent } from "axios";
import Instense from "./Axios-config";

export const DEFAULT_UPLOAD_EXTENSIONS = [
  "pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "rtf",
  "ppt", "pptx", "jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "msg", "eml",
];

export const DEFAULT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type FileUploadMeta = {
  id: number;
  name: string;
  size: number;
  fileUrl?: string;
  fileUniqueno?: number;
  uploadFile?: string;
  pageNo?: string;
  createdBy?: number;
  isPending?: boolean;
  localUrl?: string;
  file?: File;
  fileCode?: string;
  contentType?: string;
};

export type FileValidationResult = {
  valid: File[];
  errors: string[];
};

export type UploadProgressHandler = (percent: number) => void;

export function getFileExtension(name: string): string {
  const parts = (name || "").split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

export function formatFileSize(size: number): string {
  if (!size || size <= 0) return "0 KB";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export function getApiErrorMessage(error: unknown, fallback = "Request failed"): string {
  const err = error as {
    message?: string;
    response?: { data?: { error?: string; message?: string } };
  };
  return err?.response?.data?.error || err?.response?.data?.message || err?.message || fallback;
}

export function validateSelectedFiles(
  files: File[],
  options?: {
    acceptedExtensions?: string[];
    maxFileSizeBytes?: number;
    existing?: Array<{ name: string; size: number }>;
  }
): FileValidationResult {
  const acceptedExtensions = options?.acceptedExtensions || DEFAULT_UPLOAD_EXTENSIONS;
  const maxFileSizeBytes = options?.maxFileSizeBytes || DEFAULT_MAX_UPLOAD_BYTES;
  const existingKeys = new Set(
    (options?.existing || []).map((item) => `${item.name.toLowerCase()}::${item.size}`)
  );
  const seen = new Set<string>();
  const valid: File[] = [];
  const errors: string[] = [];
  const maxSizeMb = (maxFileSizeBytes / (1024 * 1024)).toFixed(0);

  for (const file of files) {
    const ext = getFileExtension(file.name);
    const key = `${file.name.toLowerCase()}::${file.size}`;

    if (!acceptedExtensions.includes(ext)) {
      errors.push(`File type .${ext || "unknown"} is not supported: ${file.name}`);
      continue;
    }
    if (file.size > maxFileSizeBytes) {
      errors.push(`File exceeds ${maxSizeMb} MB limit: ${file.name}`);
      continue;
    }
    if (existingKeys.has(key) || seen.has(key)) {
      errors.push(`Skipped duplicate file: ${file.name}`);
      continue;
    }

    seen.add(key);
    valid.push(file);
  }

  return { valid, errors };
}

export function createPendingAttachments(
  files: File[],
  idSeed = Date.now()
): FileUploadMeta[] {
  return files.map((file, idx) => ({
    id: idSeed + idx,
    name: file.name,
    size: file.size,
    isPending: true,
    localUrl: URL.createObjectURL(file),
    file,
    contentType: file.type,
  }));
}

export function getPendingFiles(attachments: FileUploadMeta[]): File[] {
  return attachments
    .filter((attachment) => attachment.isPending && attachment.file)
    .map((attachment) => attachment.file as File);
}

export function revokeLocalAttachmentUrls(attachments: FileUploadMeta[]): void {
  attachments.forEach((attachment) => {
    if (attachment.localUrl) {
      try {
        URL.revokeObjectURL(attachment.localUrl);
      } catch {
        // ignore
      }
    }
  });
}

export function triggerBrowserDownload(url: string, fileName: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName || "download");
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function appendFilesToFormData(
  formData: FormData,
  files: File[],
  fieldName = "file"
): FormData {
  files.forEach((file) => formData.append(fieldName, file));
  return formData;
}

export async function postMultipart<T = unknown>(
  url: string,
  formData: FormData,
  onProgress?: UploadProgressHandler
): Promise<T> {
  const { data } = await Instense.post<T>(url, formData, {
    onUploadProgress: (event: AxiosProgressEvent) => {
      if (!onProgress || !event.total) return;
      const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
      onProgress(percent);
    },
  });
  return data;
}
