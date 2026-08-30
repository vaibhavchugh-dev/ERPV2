import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { UserManagementService } from "../../Common/Services/UserManagementService";
import "./ResetPasswordModal.scss";

export interface ResetPasswordUser {
  userId: number;
  userName?: string;
  displayName?: string;
}

interface ResetPasswordModalProps {
  user: ResetPasswordUser;
  onClose: () => void;
  onSuccess?: () => void;
}

const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({ user, onClose, onSuccess }) => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ newPassword?: string; confirmPassword?: string }>({});

  useEffect(() => {
    setNewPassword("");
    setConfirmPassword("");
    setShowNew(false);
    setShowConfirm(false);
    setErrors({});
  }, [user.userId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loading, onClose]);

  const validate = (): boolean => {
    const next: { newPassword?: string; confirmPassword?: string } = {};
    if (!newPassword.trim()) {
      next.newPassword = "New password is required";
    } else if (newPassword.length < 8) {
      next.newPassword = "Password must be at least 8 characters";
    }
    if (!confirmPassword.trim()) {
      next.confirmPassword = "Confirm password is required";
    } else if (newPassword !== confirmPassword) {
      next.confirmPassword = "Passwords do not match";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 1;

      const result = await UserManagementService.ResetPassword({
        userId: user.userId,
        tenantId: tenantID,
        newPassword,
      });

      toast.success(
        result?.message ||
          "Password reset successfully. User must change password on next login."
      );
      onSuccess?.();
      onClose();
    } catch (error: any) {
      console.error("[UserManagement] Error resetting password:", error);
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Failed to reset password";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const titleName =
    user.displayName?.trim() ||
    user.userName?.trim() ||
    `User #${user.userId}`;

  return (
    <div
      className="reset-password-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
      role="presentation"
    >
      <div
        className="reset-password-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-password-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="reset-password-modal-header">
          <div>
            <h3 id="reset-password-title">Reset Password</h3>
            <p>
              Set a temporary password for <strong>{titleName}</strong>
              {user.userName ? (
                <>
                  {" "}
                  (<span className="reset-password-username">{user.userName}</span>)
                </>
              ) : null}
              .
            </p>
          </div>
          <button
            type="button"
            className="reset-password-close"
            onClick={onClose}
            disabled={loading}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="reset-password-form" autoComplete="off">
          <div className="reset-password-notice">
            The user will be required to change this password on next login.
          </div>

          <div className="form-group">
            <label htmlFor="reset-new-password">
              New Password <span className="required">*</span>
            </label>
            <div className="password-input-wrap">
              <input
                id="reset-new-password"
                type={showNew ? "text" : "password"}
                className={`form-input ${errors.newPassword ? "error" : ""}`}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (errors.newPassword) setErrors((prev) => ({ ...prev, newPassword: undefined }));
                }}
                autoComplete="new-password"
                disabled={loading}
                autoFocus
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowNew((v) => !v)}
                aria-label={showNew ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showNew ? "Hide" : "Show"}
              </button>
            </div>
            {errors.newPassword && <span className="error-message">{errors.newPassword}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="reset-confirm-password">
              Confirm Password <span className="required">*</span>
            </label>
            <div className="password-input-wrap">
              <input
                id="reset-confirm-password"
                type={showConfirm ? "text" : "password"}
                className={`form-input ${errors.confirmPassword ? "error" : ""}`}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errors.confirmPassword) {
                    setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                  }
                }}
                autoComplete="new-password"
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showConfirm ? "Hide" : "Show"}
              </button>
            </div>
            {errors.confirmPassword && (
              <span className="error-message">{errors.confirmPassword}</span>
            )}
          </div>

          <div className="reset-password-actions">
            <button type="button" className="btn-cancel" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? "Saving…" : "Reset Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ResetPasswordModal;
