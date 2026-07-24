/**
 * Quotation-scoped session cache for attachment document bytes.
 * Stores blob object URLs for lazy-loaded viewer documents.
 * Call clear() when the Customer Quotation slideout closes.
 */

export type CachedAttachmentDocument = {
  key: string;
  attachmentId: number | string;
  fileUniqueno?: number;
  name: string;
  size: number;
  contentType: string;
  blobUrl: string;
  /** True when blobUrl was created via createObjectURL and must be revoked on clear. */
  ownsUrl: boolean;
  loadedAt: number;
};

export type AttachmentCacheKeyInput = {
  id?: number | string;
  fileUniqueno?: number;
  isPending?: boolean;
  localUrl?: string;
};

function buildCacheKey(input: AttachmentCacheKeyInput): string {
  if (input.isPending && input.localUrl) {
    return `pending:${input.id ?? input.localUrl}`;
  }
  if (input.fileUniqueno && input.fileUniqueno > 0) {
    return `fu:${input.fileUniqueno}`;
  }
  return `id:${input.id}`;
}

export class AttachmentDocumentCache {
  private entries = new Map<string, CachedAttachmentDocument>();
  private inflight = new Map<string, Promise<CachedAttachmentDocument>>();

  getKey(input: AttachmentCacheKeyInput): string {
    return buildCacheKey(input);
  }

  has(input: AttachmentCacheKeyInput): boolean {
    return this.entries.has(buildCacheKey(input));
  }

  get(input: AttachmentCacheKeyInput): CachedAttachmentDocument | null {
    return this.entries.get(buildCacheKey(input)) || null;
  }

  set(entry: Omit<CachedAttachmentDocument, "key" | "loadedAt"> & { key?: string }): CachedAttachmentDocument {
    const key =
      entry.key ||
      buildCacheKey({
        id: entry.attachmentId,
        fileUniqueno: entry.fileUniqueno,
        isPending: !entry.ownsUrl && entry.blobUrl.startsWith("blob:") ? false : undefined,
      });

    // Replace existing entry and revoke previous owned URL if different.
    const existing = this.entries.get(key);
    if (existing && existing.ownsUrl && existing.blobUrl !== entry.blobUrl) {
      try {
        URL.revokeObjectURL(existing.blobUrl);
      } catch {
        // ignore
      }
    }

    const cached: CachedAttachmentDocument = {
      ...entry,
      key,
      loadedAt: Date.now(),
    };
    this.entries.set(key, cached);
    return cached;
  }

  /**
   * Deduplicates concurrent loads for the same attachment.
   */
  async getOrLoad(
    input: AttachmentCacheKeyInput,
    loader: () => Promise<Omit<CachedAttachmentDocument, "key" | "loadedAt">>
  ): Promise<CachedAttachmentDocument> {
    const key = buildCacheKey(input);
    const existing = this.entries.get(key);
    if (existing) {
      return existing;
    }

    const pending = this.inflight.get(key);
    if (pending) {
      return pending;
    }

    const promise = (async () => {
      try {
        const loaded = await loader();
        return this.set({ ...loaded, key });
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, promise);
    return promise;
  }

  remove(input: AttachmentCacheKeyInput): void {
    const key = buildCacheKey(input);
    const existing = this.entries.get(key);
    if (!existing) return;
    if (existing.ownsUrl) {
      try {
        URL.revokeObjectURL(existing.blobUrl);
      } catch {
        // ignore
      }
    }
    this.entries.delete(key);
    this.inflight.delete(key);
  }

  clear(): void {
    this.entries.forEach((entry) => {
      if (entry.ownsUrl) {
        try {
          URL.revokeObjectURL(entry.blobUrl);
        } catch {
          // ignore
        }
      }
    });
    this.entries.clear();
    this.inflight.clear();
  }
}

export default AttachmentDocumentCache;
