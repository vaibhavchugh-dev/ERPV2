import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHeadset,
  faPaperPlane,
  faTimes,
  faArrowLeft,
} from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";
import {
  SupportTicketService,
  SUPPORT_CATEGORIES,
  SupportTicketListItem,
  SupportTicketDetail,
  SupportCategory,
} from "../Services/SupportTicketService";
import { APP_VERSION } from "../Constants/AppVersion";
import { useActiveLocation } from "../Hooks/useActiveLocation";
import "./ContactSupportDialog.scss";

interface ContactSupportDialogProps {
  open: boolean;
  onClose: () => void;
  initialTab?: "new" | "mine";
  initialTicketId?: number | null;
  onUnreadChanged?: () => void;
}

type Tab = "new" | "mine";

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusClass(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "resolved" || s === "closed") return "support-status support-status--done";
  if (s === "waitingonuser") return "support-status support-status--wait";
  return "support-status support-status--open";
}

const ContactSupportDialog: React.FC<ContactSupportDialogProps> = ({
  open,
  onClose,
  initialTab = "new",
  initialTicketId = null,
  onUnreadChanged,
}) => {
  const { locationId } = useActiveLocation();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [category, setCategory] = useState<SupportCategory>("Bug");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  const [tickets, setTickets] = useState<SupportTicketListItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selected, setSelected] = useState<SupportTicketDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [followUp, setFollowUp] = useState("");
  const [replying, setReplying] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab(initialTicketId ? "mine" : initialTab);
    setCategory("Bug");
    setSubject("");
    setDescription("");
    setAttachment(null);
    setSelected(null);
    setFollowUp("");
  }, [open, initialTab, initialTicketId]);

  useEffect(() => {
    if (!open || tab !== "mine") return;
    let cancelled = false;
    setLoadingList(true);
    SupportTicketService.ListMine(50)
      .then((items) => {
        if (!cancelled) setTickets(items);
      })
      .catch(() => {
        if (!cancelled) {
          setTickets([]);
          toast.error("Failed to load your support requests.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tab]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const prevBodyOverflow = document.body.style.overflow;
    const pageContent = document.querySelector(".page-content") as HTMLElement | null;
    const prevPageOverflow = pageContent?.style.overflow ?? "";
    document.body.style.overflow = "hidden";
    if (pageContent) pageContent.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevBodyOverflow;
      if (pageContent) pageContent.style.overflow = prevPageOverflow;
    };
  }, [open, onClose]);

  const openTicket = async (id: number) => {
    setLoadingDetail(true);
    setFollowUp("");
    try {
      const detail = await SupportTicketService.Get(id);
      setSelected(detail);
      setTickets((prev) =>
        prev.map((t) => (t.id === id ? { ...t, hasUnread: false } : t))
      );
      onUnreadChanged?.();
    } catch {
      toast.error("Failed to load ticket.");
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (!open || !initialTicketId) return;
    void openTicket(initialTicketId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTicketId]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!subject.trim()) {
      toast.error("Enter a subject.");
      return;
    }
    if (!description.trim()) {
      toast.error("Describe the issue.");
      return;
    }
    if (attachment && attachment.size > 8 * 1024 * 1024) {
      toast.error("Attachment must be 8 MB or smaller.");
      return;
    }

    setSending(true);
    try {
      const result = await SupportTicketService.Create({
        category,
        subject: subject.trim(),
        description: description.trim(),
        appSource: "UI",
        appVersion: APP_VERSION,
        product: "CimmpleFlow",
        locationId: locationId || undefined,
        linkPath: window.location.pathname + window.location.search,
        attachment,
      });

      if (result.ticketId > 0) {
        if (result.emailError) {
          toast.warning(
            `Request #${result.ticketId} saved. Email notify: ${result.emailError}`
          );
        } else {
          toast.success(`Support request #${result.ticketId} submitted.`);
        }
        setSubject("");
        setDescription("");
        setAttachment(null);
        setTab("mine");
        return;
      }
      toast.error("Could not submit support request.");
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        "Failed to submit support request.";
      toast.error(typeof msg === "string" ? msg : "Failed to submit support request.");
    } finally {
      setSending(false);
    }
  };

  const downloadAttachment = async () => {
    if (!selected?.hasAttachment) return;
    try {
      await SupportTicketService.DownloadAttachment(selected.id);
    } catch {
      toast.error("Failed to download attachment.");
    }
  };

  const sendFollowUp = async () => {
    if (!selected) return;
    if (!followUp.trim()) {
      toast.error("Enter a message.");
      return;
    }
    setReplying(true);
    try {
      const result = await SupportTicketService.Reply(selected.id, followUp.trim());
      if (result.messageId > 0) {
        if (result.emailError) {
          toast.warning(`Reply saved. Email: ${result.emailError}`);
        } else {
          toast.success("Follow-up sent.");
        }
        setFollowUp("");
        await openTicket(selected.id);
      } else {
        toast.error("Could not send follow-up.");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to send follow-up.");
    } finally {
      setReplying(false);
    }
  };

  return (
    <div
      className="contact-support-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="contact-support-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-support-title"
      >
        <div className="contact-support-header">
          <h2 id="contact-support-title">
            <FontAwesomeIcon icon={faHeadset} />
            <span>Contact support</span>
          </h2>
          <button
            type="button"
            className="contact-support-close"
            onClick={onClose}
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="contact-support-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "new"}
            className={tab === "new" ? "is-active" : ""}
            onClick={() => {
              setSelected(null);
              setTab("new");
            }}
          >
            New request
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "mine"}
            className={tab === "mine" ? "is-active" : ""}
            onClick={() => {
              setSelected(null);
              setTab("mine");
            }}
          >
            My requests
            {tickets.some((t) => t.hasUnread) && (
              <span className="support-tab-badge">
                {tickets.filter((t) => t.hasUnread).length}
              </span>
            )}
          </button>
        </div>

        <div className="contact-support-body">
          {tab === "new" && (
            <div className="contact-support-form">
              <p className="contact-support-intro">
                Tell us what went wrong. We include your tenant, user, and page
                context automatically.
              </p>

              <label>
                Category
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as SupportCategory)}
                >
                  {SUPPORT_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Subject
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={200}
                  placeholder="Short summary"
                />
              </label>

              <label>
                Description
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  maxLength={4000}
                  placeholder="What were you doing? What did you expect? What happened instead?"
                />
              </label>

              <label>
                Attachment <span className="optional">(optional, max 8 MB)</span>
                <input
                  type="file"
                  accept="image/*,.pdf,.txt,.csv,.xlsx,.xls,.doc,.docx"
                  onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          )}

          {tab === "mine" && !selected && (
            <div className="contact-support-list">
              {loadingList && <p className="muted">Loading…</p>}
              {!loadingList && tickets.length === 0 && (
                <p className="muted">No support requests yet.</p>
              )}
              {!loadingList &&
                tickets.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`support-ticket-row ${t.hasUnread ? "is-unread" : ""}`}
                    onClick={() => void openTicket(t.id)}
                  >
                    <div className="support-ticket-row__top">
                      <span className="support-ticket-id">
                        #{t.id}
                        {t.hasUnread && <span className="support-unread-dot" aria-label="Unread" />}
                      </span>
                      <span className={statusClass(t.status)}>{t.status}</span>
                    </div>
                    <div className="support-ticket-subject">{t.subject}</div>
                    <div className="support-ticket-meta">
                      {t.category} · {formatWhen(t.createdAt)}
                    </div>
                  </button>
                ))}
            </div>
          )}

          {tab === "mine" && selected && (
            <div className="contact-support-detail">
              <button
                type="button"
                className="support-back"
                onClick={() => setSelected(null)}
              >
                <FontAwesomeIcon icon={faArrowLeft} />
                Back to list
              </button>
              {loadingDetail ? (
                <p className="muted">Loading…</p>
              ) : (
                <>
                  <div className="support-ticket-row__top">
                    <span className="support-ticket-id">#{selected.id}</span>
                    <span className={statusClass(selected.status)}>{selected.status}</span>
                  </div>
                  <h3>{selected.subject}</h3>
                  <dl className="support-detail-fields">
                    <dt>Category</dt>
                    <dd>{selected.category}</dd>
                    {selected.locationName && (
                      <>
                        <dt>Location</dt>
                        <dd>{selected.locationName}</dd>
                      </>
                    )}
                    <dt>Submitted</dt>
                    <dd>{formatWhen(selected.createdAt)}</dd>
                    {selected.attachmentFileName && (
                      <>
                        <dt>Attachment</dt>
                        <dd>
                          <button
                            type="button"
                            className="support-attach-link"
                            onClick={() => void downloadAttachment()}
                          >
                            {selected.attachmentFileName}
                          </button>
                        </dd>
                      </>
                    )}
                  </dl>
                  <pre className="support-description">{selected.description}</pre>

                  <div className="support-thread">
                    <h4>Conversation</h4>
                    {(selected.messages || []).length === 0 && (
                      <p className="muted">No replies yet.</p>
                    )}
                    {(selected.messages || []).map((m) => (
                      <div
                        key={m.id}
                        className={`support-msg ${
                          m.authorType === "Staff" ? "support-msg--staff" : "support-msg--mine"
                        }`}
                      >
                        <div className="support-msg__meta">
                          <strong>{m.authorName}</strong>
                          <span>{formatWhen(m.createdAt)}</span>
                        </div>
                        <pre>{m.body}</pre>
                      </div>
                    ))}
                  </div>

                  {selected.status !== "Closed" && (
                    <div className="support-followup">
                      <label>
                        Follow-up
                        <textarea
                          rows={3}
                          value={followUp}
                          onChange={(e) => setFollowUp(e.target.value)}
                          maxLength={4000}
                          placeholder="Add more details or reply to support…"
                        />
                      </label>
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={replying}
                        onClick={() => void sendFollowUp()}
                      >
                        <FontAwesomeIcon icon={faPaperPlane} />
                        {replying ? "Sending…" : "Send follow-up"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {tab === "new" && (
          <div className="contact-support-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleSubmit()}
              disabled={sending}
            >
              <FontAwesomeIcon icon={faPaperPlane} />
              {sending ? "Submitting…" : "Submit request"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContactSupportDialog;
