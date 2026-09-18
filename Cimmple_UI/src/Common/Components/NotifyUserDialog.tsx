import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPaperPlane, faTimes } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";
import { UserManagementService, UserManagement } from "../Services/UserManagementService";
import { NotificationService } from "../Services/NotificationService";
import { isEmailNotificationsEnabled } from "../Utils/settingsRuntime";

interface NotifyUserDialogProps {
  open: boolean;
  onClose: () => void;
  onSent?: (conversationId?: number) => void;
}

const NotifyUserDialog: React.FC<NotifyUserDialogProps> = ({ open, onClose, onSent }) => {
  const [users, setUsers] = useState<UserManagement[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [recipientUserId, setRecipientUserId] = useState<number>(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");

  const emailEnabled = isEmailNotificationsEnabled();

  useEffect(() => {
    if (!open) return;
    setRecipientUserId(0);
    setTitle("");
    setBody("");
    setSearch("");
    setSendEmail(emailEnabled);
    setLoadingUsers(true);
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantId = storage?.tenantID || 0;
    const currentUserId = Number(
      storage?.userId || storage?.user_UniqueID || storage?.userUniqueID || 0
    );
    UserManagementService.GetUsers({
      tenantid: tenantId,
      pageNumber: 1,
      pageSize: 200,
      status: "Active",
    })
      .then((res: any) => {
        const rawUsers = res?.users || res?.result?.users || [];
        const mapped = (Array.isArray(rawUsers) ? rawUsers : [])
          .map((u: any) => ({
            ...u,
            userUniqueID: Number(u.userUniqueID ?? u.UserUniqueID ?? u.user_UniqueID ?? 0),
            firstName: u.firstName ?? u.FirstName,
            lastName: u.lastName ?? u.LastName,
            userName: u.userName ?? u.UserName,
            email: u.email ?? u.Email,
          }))
          .filter((u: UserManagement) => u.userUniqueID > 0 && u.userUniqueID !== currentUserId);
        setUsers(mapped);
      })
      .catch(() => {
        setUsers([]);
        toast.error("Failed to load users.");
      })
      .finally(() => setLoadingUsers(false));
  }, [open, emailEnabled]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase();
      return (
        name.includes(q) ||
        (u.userName || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q)
      );
    });
  }, [users, search]);

  if (!open) return null;

  const handleSend = async () => {
    if (!recipientUserId) {
      toast.error("Select a recipient.");
      return;
    }
    if (!body.trim()) {
      toast.error("Enter a message.");
      return;
    }
    if (sendEmail && !emailEnabled) {
      toast.error("Email notifications are disabled in System Settings.");
      return;
    }

    setSending(true);
    try {
      const result = await NotificationService.Send({
        recipientUserId: Number(recipientUserId),
        title: title.trim() || undefined,
        body: body.trim(),
        sendEmail: sendEmail && emailEnabled,
      });
      if (result?.conversationId || result?.messageId) {
        if (result.emailError && result.inboxCreated) {
          toast.warning(`Sent in-app. Email: ${result.emailError}`);
        } else {
          toast.success(
            result.emailSent ? "Message sent (in-app + email)." : "Message sent."
          );
        }
        onSent?.(result.conversationId ?? undefined);
        onClose();
        return;
      }
      if (!result?.inboxCreated && !result?.emailSent) {
        toast.error(result?.emailError || "Message was not delivered.");
        return;
      }
      onSent?.(result.conversationId ?? undefined);
      onClose();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        "Failed to send notification.";
      toast.error(typeof msg === "string" ? msg : "Failed to send notification.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem 1.25rem",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: "1rem" }}>New message</div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: "none", background: "none", cursor: "pointer", color: "#6b7280" }}
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div style={{ padding: "1.25rem", display: "grid", gap: "0.85rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", marginBottom: 4, color: "#374151" }}>
              Recipient
            </label>
            <input
              type="text"
              placeholder="Search users…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                marginBottom: 6,
                padding: "0.5rem 0.75rem",
                border: "1px solid #d1d5db",
                borderRadius: 8,
                fontSize: "0.875rem",
              }}
            />
            <select
              value={recipientUserId || ""}
              onChange={(e) => setRecipientUserId(Number(e.target.value) || 0)}
              disabled={loadingUsers}
              style={{
                width: "100%",
                padding: "0.5rem 0.75rem",
                border: "1px solid #d1d5db",
                borderRadius: 8,
                fontSize: "0.875rem",
              }}
            >
              <option value="">{loadingUsers ? "Loading…" : "Select user"}</option>
              {filteredUsers.map((u) => {
                const label =
                  `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
                  u.userName ||
                  u.email ||
                  `User ${u.userUniqueID}`;
                return (
                  <option key={u.userUniqueID} value={u.userUniqueID}>
                    {label}
                    {u.email ? ` (${u.email})` : ""}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", marginBottom: 4, color: "#374151" }}>
              Title (optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              style={{
                width: "100%",
                padding: "0.5rem 0.75rem",
                border: "1px solid #d1d5db",
                borderRadius: 8,
                fontSize: "0.875rem",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", marginBottom: 4, color: "#374151" }}>
              Message
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              maxLength={4000}
              style={{
                width: "100%",
                padding: "0.5rem 0.75rem",
                border: "1px solid #d1d5db",
                borderRadius: 8,
                fontSize: "0.875rem",
                resize: "vertical",
              }}
            />
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: "0.875rem",
              color: emailEnabled ? "#374151" : "#9ca3af",
              cursor: emailEnabled ? "pointer" : "not-allowed",
            }}
          >
            <input
              type="checkbox"
              checked={sendEmail && emailEnabled}
              disabled={!emailEnabled}
              onChange={(e) => setSendEmail(e.target.checked)}
            />
            Also send email
            {!emailEnabled && (
              <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                (disabled in System Settings)
              </span>
            )}
          </label>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "0.85rem 1.25rem",
            borderTop: "1px solid #e5e7eb",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "0.5rem 0.9rem",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            style={{
              padding: "0.5rem 0.9rem",
              borderRadius: 8,
              border: "none",
              background: "#4f46e5",
              color: "#fff",
              cursor: sending ? "wait" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <FontAwesomeIcon icon={faPaperPlane} />
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotifyUserDialog;
