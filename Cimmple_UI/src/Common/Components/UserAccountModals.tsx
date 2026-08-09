import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes, faUser, faKeyboard, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { EmployeeService } from "../Services/EmployeeService";
import { AuthService } from "../Services/AuthService";
import "./UserAccountModals.scss";

// Keep in sync with package.json; CRA does not expose version at runtime by default.
export const APP_VERSION = "1.0.0";

export type UserAccountModalKind = "profile" | "help" | "about" | null;

interface UserAccountModalsProps {
  kind: UserAccountModalKind;
  onClose: () => void;
  onChangePassword?: () => void;
}

interface ProfileInfo {
  displayName: string;
  userLogin: string;
  email: string;
  role: string;
  tenantId: number | string;
  userId: number | string;
  canAccessAllLocations: boolean;
  sessionTimeoutMinutes?: number;
}

function readProfileFromStorage(): ProfileInfo {
  const storage = JSON.parse(localStorage.getItem("storage") || "{}");
  return {
    displayName: storage?.userName || "User",
    userLogin: storage?.userLogin || "",
    email: storage?.email || "",
    role: storage?.role || "User",
    tenantId: storage?.tenantID ?? "—",
    userId: storage?.userId ?? "—",
    canAccessAllLocations: !!storage?.canAccessAllLocations,
    sessionTimeoutMinutes: storage?.sessionTimeoutMinutes,
  };
}

const UserAccountModals: React.FC<UserAccountModalsProps> = ({
  kind,
  onClose,
  onChangePassword,
}) => {
  const [profile, setProfile] = useState<ProfileInfo>(readProfileFromStorage);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (kind !== "profile") return;

    let objectUrl: string | null = null;
    let cancelled = false;

    const load = async () => {
      await AuthService.syncCurrentUserProfile();
      if (cancelled) return;

      const info = readProfileFromStorage();
      setProfile(info);

      const userId = Number(info.userId);
      if (userId > 0) {
        try {
          const blob = await EmployeeService.GetProfilePic({ userId });
          if (cancelled) return;
          if (blob && blob.size > 0 && blob.type?.startsWith("image/")) {
            objectUrl = URL.createObjectURL(blob);
            setAvatarUrl(objectUrl);
          } else {
            setAvatarUrl(null);
          }
        } catch {
          if (!cancelled) setAvatarUrl(null);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [kind]);

  useEffect(() => {
    if (!kind) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [kind, onClose]);

  if (!kind) return null;

  const title =
    kind === "profile"
      ? "My Profile"
      : kind === "help"
        ? "Help & Shortcuts"
        : "About Cimmple";

  const titleIcon =
    kind === "profile" ? faUser : kind === "help" ? faKeyboard : faInfoCircle;

  return (
    <div className="user-account-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="user-account-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-account-modal-title"
      >
        <div className="user-account-modal-header">
          <h2 id="user-account-modal-title">
            <FontAwesomeIcon icon={titleIcon} />
            <span>{title}</span>
          </h2>
          <button type="button" className="user-account-modal-close" onClick={onClose} aria-label="Close">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div className="user-account-modal-body">
          {kind === "profile" && (
            <>
              <div className="profile-hero">
                <div className="profile-avatar">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" />
                  ) : (
                    <FontAwesomeIcon icon={faUser} />
                  )}
                </div>
                <div>
                  <div className="profile-name">{profile.displayName}</div>
                  <div className="profile-role">{profile.role || "User"}</div>
                </div>
              </div>
              <dl className="profile-fields">
                {profile.userLogin && (
                  <>
                    <dt>Username</dt>
                    <dd>{profile.userLogin}</dd>
                  </>
                )}
                <dt>Email</dt>
                <dd>{profile.email || "—"}</dd>
                <dt>Role</dt>
                <dd>{profile.role || "—"}</dd>
                <dt>User ID</dt>
                <dd>{profile.userId}</dd>
                <dt>Tenant</dt>
                <dd>{profile.tenantId}</dd>
                <dt>Location access</dt>
                <dd>
                  {profile.canAccessAllLocations
                    ? "All locations"
                    : "Assigned locations only"}
                </dd>
                {profile.sessionTimeoutMinutes != null && (
                  <>
                    <dt>Session timeout</dt>
                    <dd>{profile.sessionTimeoutMinutes} minutes</dd>
                  </>
                )}
              </dl>
              {onChangePassword && (
                <button
                  type="button"
                  className="user-account-modal-action"
                  onClick={onChangePassword}
                >
                  Change password
                </button>
              )}
            </>
          )}

          {kind === "help" && (
            <div className="help-content">
              <p className="help-intro">
                Quick tips for getting around Cimmple ERP.
              </p>
              <table className="shortcuts-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Shortcut</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Global search</td>
                    <td>
                      <kbd>Ctrl</kbd> + <kbd>K</kbd>
                      <span className="shortcut-or"> / </span>
                      <kbd>⌘</kbd> + <kbd>K</kbd>
                    </td>
                  </tr>
                  <tr>
                    <td>Close dialog / slideout</td>
                    <td>
                      <kbd>Esc</kbd>
                    </td>
                  </tr>
                </tbody>
              </table>
              <ul className="help-tips">
                <li>
                  Use the <strong>working site</strong> switcher in the top bar to
                  filter lists by location.
                </li>
                <li>
                  Open a listing&apos;s <strong>Columns</strong> control to show or
                  hide table columns; choices are saved for your browser.
                </li>
                <li>
                  Account security: change your password from the user menu anytime.
                </li>
              </ul>
              <p className="help-footer">
                Need more help? Visit{" "}
                <a
                  href="https://www.cimmple.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  cimmple.com
                </a>
                .
              </p>
            </div>
          )}

          {kind === "about" && (
            <div className="about-content">
              <div className="about-brand">
                <img src="/logo.svg" alt="" className="about-logo" />
                <div>
                  <div className="about-product">Cimmple ERP</div>
                  <div className="about-tagline">
                    Cloud operating system for machine shops
                  </div>
                </div>
              </div>
              <dl className="profile-fields">
                <dt>Version</dt>
                <dd>{APP_VERSION}</dd>
                <dt>Product</dt>
                <dd>CimmpleFlow</dd>
                <dt>Website</dt>
                <dd>
                  <a
                    href="https://www.cimmple.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    www.cimmple.com
                  </a>
                </dd>
              </dl>
              <p className="about-copy">
                Built for CNC &amp; job shops — quotations, orders, purchasing,
                inventory, quality, and accounting in one place.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserAccountModals;
