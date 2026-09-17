import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faTimes, faPaperPlane } from "@fortawesome/free-solid-svg-icons";
import {
  DocumentEmailKind,
  DocumentEmailService,
  DOCUMENT_EMAIL_LABELS,
} from "../Services/DocumentEmailService";
import { isEmailNotificationsEnabled } from "../Utils/settingsRuntime";

export interface SendDocumentEmailDialogProps {
  open: boolean;
  kind: DocumentEmailKind;
  documentId: number;
  /** Prefill To when known from the open record */
  defaultToEmail?: string;
  documentLabel?: string;
  onClose: () => void;
  onSent?: () => void;
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.625rem 0.75rem",
  border: "1px solid #d1d5db",
  borderRadius: "0.375rem",
  fontSize: "0.875rem",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: 500,
  color: "#374151",
  marginBottom: "0.35rem",
};

/**
 * Lightweight confirm dialog to email a generated PDF via DocumentEmail API.
 */
const SendDocumentEmailDialog: React.FC<SendDocumentEmailDialogProps> = ({
  open,
  kind,
  documentId,
  defaultToEmail = "",
  documentLabel,
  onClose,
  onSent,
}) => {
  const [toEmail, setToEmail] = useState(defaultToEmail);
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const kindLabel = DOCUMENT_EMAIL_LABELS[kind];
  const titleLabel = documentLabel ? `${kindLabel} ${documentLabel}` : kindLabel;

  useEffect(() => {
    if (!open) return;
    setToEmail(defaultToEmail || "");
    setCc("");
    setSubject(documentLabel ? `${kindLabel} ${documentLabel}` : "");
    setMessage("");
  }, [open, defaultToEmail, documentLabel, kindLabel]);

  if (!open) return null;

  const handleSend = async () => {
    if (!isEmailNotificationsEnabled()) {
      toast.error("Email notifications are disabled in System Settings (General).");
      return;
    }
    if (documentId <= 0) {
      toast.error("Save the document before emailing.");
      return;
    }

    setSending(true);
    try {
      const result = await DocumentEmailService.Send(kind, {
        id: documentId,
        toEmail: toEmail.trim() || undefined,
        cc: cc.trim() || undefined,
        subject: subject.trim() || undefined,
        message: message.trim() || undefined,
      });
      toast.success(
        result?.message
          ? `${result.message}${result.toEmail ? ` (${result.toEmail})` : ""}`
          : `Email sent${result?.toEmail ? ` to ${result.toEmail}` : ""}`
      );
      onSent?.();
      onClose();
    } catch (error: any) {
      const data = error?.response?.data;
      const timedOut =
        error?.code === "ECONNABORTED" ||
        /timeout/i.test(String(error?.message || ""));
      const apiMessage =
        (typeof data === "string" && data) ||
        data?.message ||
        data?.error ||
        (timedOut
          ? "Request timed out while generating the PDF or waiting for the mail server. Try again, or send without CC."
          : null) ||
        error?.message ||
        "Failed to send email";
      toast.error(apiMessage);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.45)",
        zIndex: 10050,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "0.5rem",
          width: "100%",
          maxWidth: "480px",
          boxShadow: "0 20px 40px rgba(0,0,0,0.18)",
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
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <FontAwesomeIcon icon={faEnvelope} style={{ color: "#2563eb" }} />
            <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "#111827" }}>
              Email {titleLabel}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "#6b7280",
              padding: "0.25rem",
            }}
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div style={{ padding: "1.25rem", display: "grid", gap: "0.9rem" }}>
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "#6b7280" }}>
            Sends the PDF attachment using System Settings SMTP. Leave To blank to use the
            customer/vendor email on file. Generating the PDF and talking to the mail server can
            take up to a couple of minutes — especially with CC to external addresses.
          </p>
          <div>
            <label style={labelStyle}>To</label>
            <input
              type="email"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              placeholder="Recipient email (optional if on file)"
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Cc</label>
            <input
              type="text"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="Optional — comma-separated"
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={`Optional — defaults to ${kindLabel}`}
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Optional — leave blank for a short default message"
              rows={4}
              style={{ ...fieldStyle, resize: "vertical" }}
            />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.5rem",
            padding: "0.9rem 1.25rem",
            borderTop: "1px solid #e5e7eb",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              border: "1px solid #d1d5db",
              background: "#fff",
              color: "#374151",
              fontSize: "0.875rem",
              cursor: sending ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              border: "none",
              background: sending ? "#93c5fd" : "#2563eb",
              color: "#fff",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: sending ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <FontAwesomeIcon icon={faPaperPlane} />
            {sending ? "Sending…" : "Send email"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SendDocumentEmailDialog;
