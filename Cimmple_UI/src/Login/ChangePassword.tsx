import * as React from "react";
import { Form, Button } from "react-bootstrap";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { AuthService } from "../Common/Services/AuthService";
import { User } from "../Common/Services/User";
import { protectedRoutes } from "../Common/Routes";
import "./Login.scss";

export const ChangePassword: React.FC = () => {
  const history = useHistory();
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    setIsLoading(true);
    try {
      await AuthService.changePassword(currentPassword, newPassword);
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      storage.mustChangePassword = false;
      localStorage.setItem("storage", JSON.stringify(storage));
      toast.success("Password updated");
      history.push(
        AuthService.getDefaultLandingPath(protectedRoutes.map((r) => r.path as string))
      );
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to change password");
    } finally {
      setIsLoading(false);
    }
  };

  if (!User.isAuthenticated && !localStorage.getItem("token")) {
    history.push("/login");
    return null;
  }

  return (
    <div className="login-page">
      <aside className="login-brand" aria-label="Cimmple brand">
        <div className="login-brand-top">
          <div className="login-brand-mark">
            <img src="/logo.svg" alt="" />
            <span>Cimmple</span>
          </div>
        </div>

        <div className="login-brand-copy">
          <h1>
            Secure access to your{" "}
            <em>shop floor</em>
          </h1>
          <p>
            Update your password to continue using CimmpleFlow — the cloud
            operating system for machine shops.
          </p>
        </div>

        <div className="login-brand-foot">
          <span>Built for CNC &amp; job shops</span>
          <a href="https://www.cimmple.com/" target="_blank" rel="noopener noreferrer">
            cimmple.com
          </a>
        </div>
      </aside>

      <main className="login-panel">
        <div className="login-panel-inner">
          <div className="login-panel-header">
            <h2>Change password</h2>
            <p>Choose a new password to continue</p>
          </div>

          <Form className="login-form" onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label>Current password</Form.Label>
              <Form.Control
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>New password</Form.Label>
              <Form.Control
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Confirm new password</Form.Label>
              <Form.Control
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </Form.Group>
            <Button
              type="submit"
              className="w-100 login-submit"
              disabled={isLoading}
            >
              {isLoading ? "Updating password..." : "Update password"}
            </Button>
          </Form>
        </div>
      </main>
    </div>
  );
};
