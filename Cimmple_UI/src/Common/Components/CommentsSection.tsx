import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { UserManagementService, UserManagement } from "../Services/UserManagementService";
import { EntityCommentService } from "../Services/EntityCommentService";
import { getApiErrorMessage } from "../Services/FileUploadHelper";
import { formatDateTime } from "../Utils/Formatting";

export interface EntityComment {
  id: number;
  text: string;
  createdAt: string;
  createdBy: string;
  /** Set only for newly added comments this session; stripped after persist. */
  mentionedUserIds?: number[];
}

export interface MentionUserOption {
  userId: number;
  label: string;
  email?: string;
}

/** When entityId > 0, add/delete persist immediately without document Save. */
export interface CommentPersistContext {
  entityType: string;
  entityId: number;
  entityLabel: string;
  linkPath: string;
}

interface CommentsSectionProps {
  comments: EntityComment[];
  onChange: (next: EntityComment[]) => void;
  /** When false, hide delete (e.g. job order read-only list). Default true. */
  allowDelete?: boolean;
  /** Optional: list before composer (job order style). Default composer-first. */
  listFirst?: boolean;
  disabled?: boolean;
  /** Saved document context — enables immediate comment persist + mention notify. */
  persistContext?: CommentPersistContext | null;
}

const stripMentionIds = (list: EntityComment[]): EntityComment[] =>
  list.map(({ mentionedUserIds: _m, ...rest }) => rest);

const CommentsSection: React.FC<CommentsSectionProps> = ({
  comments,
  onChange,
  allowDelete = true,
  listFirst = false,
  disabled = false,
  persistContext = null,
}) => {
  const [draft, setDraft] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [users, setUsers] = useState<MentionUserOption[]>([]);
  const [pendingMentions, setPendingMentions] = useState<MentionUserOption[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nextIdRef = useRef(1);

  const canPersist = !!(persistContext && persistContext.entityId > 0);

  useEffect(() => {
    const maxId = comments.reduce((m, c) => Math.max(m, c.id || 0), 0);
    if (maxId >= nextIdRef.current) nextIdRef.current = maxId + 1;
  }, [comments]);

  useEffect(() => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantId = storage?.tenantID || 0;
    const currentUserId = Number(
      storage?.userId || storage?.user_UniqueID || storage?.userUniqueID || 0
    );
    if (!tenantId) return;

    UserManagementService.GetUsers({
      tenantid: tenantId,
      pageNumber: 1,
      pageSize: 200,
      status: "Active",
    })
      .then((res) => {
        const opts = (res.users || [])
          .filter((u: UserManagement) => u.userUniqueID !== currentUserId)
          .map((u: UserManagement) => {
            const name = `${u.firstName || ""} ${u.lastName || ""}`.trim();
            const label = name || u.userName || u.email || `User ${u.userUniqueID}`;
            return {
              userId: u.userUniqueID,
              label,
              email: u.email,
            };
          });
        setUsers(opts);
      })
      .catch(() => setUsers([]));
  }, []);

  const filteredUsers = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    if (!q) return users.slice(0, 8);
    return users
      .filter(
        (u) =>
          u.label.toLowerCase().includes(q) ||
          (u.email || "").toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [users, mentionQuery]);

  const persistComments = useCallback(
    async (next: EntityComment[]) => {
      if (!persistContext || persistContext.entityId <= 0) return false;
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      await EntityCommentService.Save({
        tenantId: Number(storage?.tenantID || 0),
        entityType: persistContext.entityType,
        entityId: persistContext.entityId,
        entityLabel: persistContext.entityLabel,
        linkPath: persistContext.linkPath,
        comments: next,
      });
      return true;
    },
    [persistContext]
  );

  const updateMentionState = useCallback((value: string, caret: number) => {
    const before = value.slice(0, caret);
    const at = before.lastIndexOf("@");
    if (at < 0) {
      setMentionOpen(false);
      setMentionStart(null);
      return;
    }
    const charBefore = at === 0 ? " " : before[at - 1];
    if (charBefore && !/\s/.test(charBefore)) {
      setMentionOpen(false);
      setMentionStart(null);
      return;
    }
    const query = before.slice(at + 1);
    if (/\s/.test(query)) {
      setMentionOpen(false);
      setMentionStart(null);
      return;
    }
    setMentionStart(at);
    setMentionQuery(query);
    setMentionOpen(true);
    setHighlightIndex(0);
  }, []);

  const insertMention = (user: MentionUserOption) => {
    if (mentionStart == null || !textareaRef.current) return;
    const caret = textareaRef.current.selectionStart ?? draft.length;
    const before = draft.slice(0, mentionStart);
    const after = draft.slice(caret);
    const insertion = `@${user.label} `;
    const next = before + insertion + after;
    setDraft(next);
    setPendingMentions((prev) =>
      prev.some((p) => p.userId === user.userId) ? prev : [...prev, user]
    );
    setMentionOpen(false);
    setMentionStart(null);
    setMentionQuery("");
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      const pos = before.length + insertion.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const handleAdd = async () => {
    const text = draft.trim();
    if (!text || disabled || saving) return;

    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const mentionedUserIds = pendingMentions
      .filter((m) => text.includes(`@${m.label}`))
      .map((m) => m.userId);

    const newComment: EntityComment = {
      id: nextIdRef.current++,
      text,
      createdAt: new Date().toISOString(),
      createdBy: storage?.userName || "User",
      ...(mentionedUserIds.length > 0 ? { mentionedUserIds } : {}),
    };

    const previous = comments;
    const next = [...comments, newComment];
    onChange(next);
    setDraft("");
    setPendingMentions([]);
    setMentionOpen(false);

    if (!canPersist) return;

    setSaving(true);
    try {
      await persistComments(next);
      onChange(stripMentionIds(next));
    } catch (error) {
      onChange(previous);
      setDraft(text);
      setPendingMentions(pendingMentions);
      toast.error(getApiErrorMessage(error, "Failed to save comment"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (disabled || !allowDelete || saving) return;
    const previous = comments;
    const next = comments.filter((c) => c.id !== id);
    onChange(next);

    if (!canPersist) return;

    setSaving(true);
    try {
      await persistComments(next);
      onChange(stripMentionIds(next));
    } catch (error) {
      onChange(previous);
      toast.error(getApiErrorMessage(error, "Failed to delete comment"));
    } finally {
      setSaving(false);
    }
  };

  const helperText = canPersist
    ? "Comments save immediately. Mentions notify when you add. Ctrl/Cmd+Enter to add."
    : "Save the document first to keep comments. Ctrl/Cmd+Enter to add.";

  const composer = (
    <div style={{ marginBottom: listFirst ? 0 : "1.5rem", position: "relative" }}>
      <textarea
        ref={textareaRef}
        className="form-input"
        disabled={disabled || saving}
        style={{
          width: "100%",
          minHeight: listFirst ? 72 : 100,
          padding: "0.75rem",
          fontSize: "0.875rem",
          resize: "vertical",
          marginBottom: "0.75rem",
          boxSizing: "border-box",
        }}
        placeholder="Add a comment… Type @ to mention someone"
        value={draft}
        onChange={(e) => {
          const value = e.target.value;
          setDraft(value);
          updateMentionState(value, e.target.selectionStart ?? value.length);
        }}
        onKeyDown={(e) => {
          if (!mentionOpen || filteredUsers.length === 0) {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void handleAdd();
            }
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightIndex((i) => (i + 1) % filteredUsers.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightIndex((i) => (i - 1 + filteredUsers.length) % filteredUsers.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            insertMention(filteredUsers[highlightIndex]);
          } else if (e.key === "Escape") {
            setMentionOpen(false);
          }
        }}
      />
      {mentionOpen && filteredUsers.length > 0 && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: listFirst ? 76 : 104,
            zIndex: 20,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
            maxHeight: 220,
            overflowY: "auto",
          }}
        >
          {filteredUsers.map((u, idx) => (
            <button
              key={u.userId}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(u);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "0.6rem 0.85rem",
                border: "none",
                background: idx === highlightIndex ? "#eef2ff" : "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#111827" }}>{u.label}</div>
              {u.email && (
                <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{u.email}</div>
              )}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => void handleAdd()}
        disabled={disabled || saving || !draft.trim()}
        style={{
          padding: "0.5rem 1rem",
          backgroundColor: disabled || saving || !draft.trim() ? "#a5b4fc" : "#6366f1",
          color: "white",
          border: "none",
          borderRadius: "0.375rem",
          fontSize: "0.875rem",
          fontWeight: 500,
          cursor: disabled || saving || !draft.trim() ? "not-allowed" : "pointer",
        }}
      >
        {saving ? "Saving…" : "Add Comment"}
      </button>
      <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#9ca3af" }}>{helperText}</div>
    </div>
  );

  const list = (
    <>
      {comments.length === 0 ? (
        !listFirst ? (
          <p style={{ margin: 0, color: "#6b7280", fontSize: "0.875rem" }}>No comments added</p>
        ) : null
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: listFirst ? "0.75rem" : "1rem",
            marginBottom: listFirst ? "1rem" : 0,
          }}
        >
          {comments.map((comment) => (
            <div
              key={comment.id}
              style={{
                padding: listFirst ? "0.75rem" : "1rem",
                backgroundColor: "#ffffff",
                borderRadius: "0.375rem",
                border: "1px solid #e5e7eb",
              }}
            >
              {listFirst ? (
                <>
                  <div style={{ fontSize: "0.875rem", marginBottom: "0.5rem", whiteSpace: "pre-wrap" }}>
                    {comment.text}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                    {comment.createdBy} - {formatDateTime(comment.createdAt)}
                  </div>
                </>
              ) : (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.25rem" }}>
                        {comment.createdBy}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                        {formatDateTime(comment.createdAt)}
                      </div>
                    </div>
                    {allowDelete && !disabled && (
                      <button
                        type="button"
                        onClick={() => void handleDelete(comment.id)}
                        disabled={saving}
                        style={{
                          padding: "0.25rem 0.5rem",
                          backgroundColor: "#ef4444",
                          color: "white",
                          border: "none",
                          borderRadius: "0.25rem",
                          cursor: saving ? "not-allowed" : "pointer",
                          fontSize: "0.75rem",
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: "0.875rem", color: "#374151", whiteSpace: "pre-wrap" }}>
                    {comment.text}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div
      style={{
        marginTop: "2rem",
        padding: "1.5rem",
        backgroundColor: "#f9fafb",
        borderRadius: "0.5rem",
        border: "1px solid #e5e7eb",
      }}
    >
      <h3 style={{ margin: "0 0 1rem 0", fontSize: "1rem", fontWeight: 600 }}>Comments</h3>
      {listFirst ? (
        <>
          {list}
          {composer}
        </>
      ) : (
        <>
          {composer}
          {list}
        </>
      )}
    </div>
  );
};

export default CommentsSection;
