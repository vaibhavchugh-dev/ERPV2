import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { SupportStaffAuth } from "./SupportStaffAuth";
import {
  SupportTicketDetail,
  SupportTicketListItem,
} from "../Common/Services/SupportTicketService";
import "./SupportInbox.scss";

function formatWhen(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusClass(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "resolved" || s === "closed") return "si-badge si-badge--done";
  if (s === "waitingonuser") return "si-badge si-badge--wait";
  return "si-badge si-badge--open";
}

const SupportInboxPage: React.FC = () => {
  const user = SupportStaffAuth.getUser();
  const [products, setProducts] = useState<string[]>(user?.products || ["CimmpleFlow"]);
  const [product, setProduct] = useState("all");
  const [status, setStatus] = useState("Open");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [tickets, setTickets] = useState<SupportTicketListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SupportTicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [replyStatus, setReplyStatus] = useState("WaitingOnUser");
  const [sending, setSending] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const items = await SupportStaffAuth.listTickets({
        product: product === "all" ? undefined : product,
        status: status === "all" ? undefined : status,
        q: search.trim() || undefined,
        take: 150,
      });
      setTickets(items);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load tickets.");
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [product, status, search]);

  useEffect(() => {
    void SupportStaffAuth.getProducts()
      .then(setProducts)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const openTicket = async (id: number) => {
    setSelectedId(id);
    setDetailLoading(true);
    setReply("");
    try {
      const d = await SupportStaffAuth.getTicket(id);
      setDetail(d);
      if (d?.status === "Open") setReplyStatus("WaitingOnUser");
      else setReplyStatus(d?.status || "WaitingOnUser");
    } catch {
      toast.error("Failed to load ticket.");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const sendReply = async () => {
    if (!selectedId || !reply.trim()) {
      toast.error("Enter a reply.");
      return;
    }
    setSending(true);
    try {
      const result = await SupportStaffAuth.reply(selectedId, reply.trim(), replyStatus);
      if (result?.emailError) {
        toast.warning(`Reply saved. Email: ${result.emailError}`);
      } else {
        toast.success("Reply sent.");
      }
      setReply("");
      await openTicket(selectedId);
      await loadList();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to send reply.");
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async (next: string) => {
    if (!selectedId) return;
    try {
      await SupportStaffAuth.updateStatus(selectedId, next);
      toast.success("Status updated.");
      await openTicket(selectedId);
      await loadList();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to update status.");
    }
  };

  const logout = () => {
    SupportStaffAuth.clear();
    window.location.href = "/support/login";
  };

  return (
    <div className="support-inbox">
      <header className="support-inbox__header">
        <div>
          <div className="support-inbox__brand">Cimmple Support</div>
          <div className="support-inbox__user">
            {user?.displayName || user?.username || "Staff"}
          </div>
        </div>
        <button type="button" className="si-btn si-btn--ghost" onClick={logout}>
          Sign out
        </button>
      </header>

      <div className="support-inbox__body">
        <aside className="support-inbox__list">
          <div className="support-inbox__filters">
            <label className="support-inbox__search">
              Search
              <div className="support-inbox__search-row">
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Ticket #, subject, tenant, requester…"
                  autoComplete="off"
                />
                {searchInput && (
                  <button
                    type="button"
                    className="si-btn si-btn--ghost support-inbox__search-clear"
                    onClick={() => setSearchInput("")}
                    aria-label="Clear search"
                  >
                    Clear
                  </button>
                )}
              </div>
            </label>
            <label>
              Product
              <select value={product} onChange={(e) => setProduct(e.target.value)}>
                <option value="all">All products</option>
                {products.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">All</option>
                <option value="Open">Open</option>
                <option value="WaitingOnUser">Waiting on user</option>
                <option value="Resolved">Resolved</option>
                <option value="Closed">Closed</option>
              </select>
            </label>
            <button type="button" className="si-btn si-btn--ghost" onClick={() => void loadList()}>
              Refresh
            </button>
          </div>

          <div className="support-inbox__tickets">
            {loading && <p className="si-muted">Loading…</p>}
            {!loading && tickets.length === 0 && (
              <p className="si-muted">No tickets match these filters.</p>
            )}
            {tickets.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`support-ticket-card ${selectedId === t.id ? "is-active" : ""}`}
                onClick={() => void openTicket(t.id)}
              >
                <div className="support-ticket-card__top">
                  <span>#{t.id}</span>
                  <span className={statusClass(t.status)}>{t.status}</span>
                </div>
                <div className="support-ticket-card__subject">{t.subject}</div>
                <div className="support-ticket-card__meta">
                  {t.product || "CimmpleFlow"} · {t.tenantName || `Tenant ${t.tenantId}`}
                  {t.locationName ? ` · ${t.locationName}` : ""} · {t.requesterName || "User"}
                </div>
                <div className="support-ticket-card__meta">{formatWhen(t.updatedAt || t.createdAt)}</div>
              </button>
            ))}
          </div>
        </aside>

        <section className="support-inbox__detail">
          {!selectedId && <p className="si-muted">Select a ticket to view and reply.</p>}
          {selectedId && detailLoading && <p className="si-muted">Loading ticket…</p>}
          {selectedId && !detailLoading && detail && (
            <>
              <div className="support-inbox__detail-head">
                <div>
                  <div className="support-inbox__detail-id">
                    #{detail.id} · {detail.product} ·{" "}
                    <span className={statusClass(detail.status)}>{detail.status}</span>
                  </div>
                  <h1>{detail.subject}</h1>
                  <div className="si-muted">
                    {detail.tenantName || `Tenant ${detail.tenantId}`}
                    {detail.locationName ? ` · ${detail.locationName}` : ""} ·{" "}
                    {detail.requesterName}
                    {detail.requesterEmail ? ` · ${detail.requesterEmail}` : ""} ·{" "}
                    {detail.category} · {detail.appSource}
                  </div>
                  {detail.hasAttachment && detail.attachmentFileName && (
                    <div style={{ marginTop: "0.5rem" }}>
                      <button
                        type="button"
                        className="si-btn si-btn--ghost"
                        onClick={() => {
                          void SupportStaffAuth.downloadAttachment(detail.id).catch(() =>
                            toast.error("Failed to download attachment.")
                          );
                        }}
                      >
                        Download: {detail.attachmentFileName}
                      </button>
                    </div>
                  )}
                </div>
                <div className="support-inbox__status-actions">
                  <button type="button" className="si-btn si-btn--ghost" onClick={() => void changeStatus("Resolved")}>
                    Mark resolved
                  </button>
                  <button type="button" className="si-btn si-btn--ghost" onClick={() => void changeStatus("Closed")}>
                    Close
                  </button>
                </div>
              </div>

              <div className="support-inbox__description">
                <h3>Original request</h3>
                <pre>{detail.description}</pre>
              </div>

              <div className="support-inbox__thread">
                <h3>Conversation</h3>
                {(detail.messages || []).length === 0 && (
                  <p className="si-muted">No follow-up messages yet.</p>
                )}
                {(detail.messages || []).map((m) => (
                  <div
                    key={m.id}
                    className={`si-msg ${m.authorType === "Staff" ? "si-msg--staff" : "si-msg--client"}`}
                  >
                    <div className="si-msg__meta">
                      <strong>{m.authorName}</strong>
                      <span>{m.authorType}</span>
                      <span>{formatWhen(m.createdAt)}</span>
                    </div>
                    <pre>{m.body}</pre>
                  </div>
                ))}
              </div>

              <div className="support-inbox__reply">
                <h3>Reply</h3>
                <textarea
                  rows={5}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Write a response to the client…"
                  maxLength={4000}
                />
                <div className="support-inbox__reply-actions">
                  <label>
                    Set status
                    <select value={replyStatus} onChange={(e) => setReplyStatus(e.target.value)}>
                      <option value="WaitingOnUser">Waiting on user</option>
                      <option value="Open">Open</option>
                      <option value="Resolved">Resolved</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="si-btn si-btn--primary"
                    disabled={sending}
                    onClick={() => void sendReply()}
                  >
                    {sending ? "Sending…" : "Send reply"}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default SupportInboxPage;
