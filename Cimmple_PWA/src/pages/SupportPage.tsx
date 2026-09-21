import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  SUPPORT_CATEGORIES,
  SupportCategory,
  createSupportTicket,
} from "../services/supportTicketService";

const APP_VERSION = "2.4.1";

export function SupportPage() {
  const navigate = useNavigate();
  const [category, setCategory] = useState<SupportCategory>("Bug");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<number | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!subject.trim() || !description.trim()) {
      setError("Subject and description are required.");
      return;
    }
    if (attachment && attachment.size > 8 * 1024 * 1024) {
      setError("Attachment must be 8 MB or smaller.");
      return;
    }

    setSending(true);
    try {
      const result = await createSupportTicket({
        category,
        subject,
        description,
        appSource: "PWA",
        appVersion: APP_VERSION,
        attachment,
      });
      if (result.ticketId > 0) {
        setSuccessId(result.ticketId);
        setSubject("");
        setDescription("");
        setAttachment(null);
      } else {
        setError("Could not submit support request.");
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        "Failed to submit support request.";
      setError(typeof msg === "string" ? msg : "Failed to submit support request.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 pb-8 pt-4">
      <header className="mb-5 flex items-center gap-3">
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">Contact support</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Report a problem from the shop floor</p>
        </div>
      </header>

      {successId != null ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-950/40">
          <p className="font-bold text-emerald-800 dark:text-emerald-300">
            Request #{successId} submitted.
          </p>
          <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-400">
            Cimmple support will follow up by email when possible.
          </p>
          <button
            type="button"
            className="mt-4 min-h-tap rounded-2xl bg-[#1e3a8a] px-4 font-bold text-white"
            onClick={() => setSuccessId(null)}
          >
            Submit another
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-200">Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as SupportCategory)}
              className="min-h-tap w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              {SUPPORT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-200">Subject</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              className="min-h-tap w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              placeholder="Short summary"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-200">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={4000}
              rows={5}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              placeholder="What were you doing? What happened?"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-200">
              Photo / file <span className="font-medium text-slate-400">(optional)</span>
            </span>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-slate-600 dark:text-slate-300"
            />
          </label>

          <button
            type="submit"
            disabled={sending}
            className="flex min-h-tap w-full items-center justify-center rounded-2xl bg-[#1e3a8a] px-4 text-sm font-extrabold text-white disabled:opacity-70"
          >
            {sending ? "Submitting…" : "Submit request"}
          </button>
        </form>
      )}
    </div>
  );
}
