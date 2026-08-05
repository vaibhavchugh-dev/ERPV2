import * as React from "react";
import { Form, Button } from "react-bootstrap";
import { useHistory } from "react-router-dom";
import { User } from "../Common/Services/User";
import { AuthService } from "../Common/Services/AuthService";
import { toast } from "react-toastify";
import "./Login.scss";

export const Login: React.FC = () => {
  const history = useHistory();
  const [userName, setUserName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [tenantId, setTenantId] = React.useState("");
  const [showTenant, setShowTenant] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const parsedTenant = tenantId ? parseInt(tenantId, 10) : undefined;
      const response = await AuthService.login(
        userName.trim(),
        password,
        parsedTenant && !isNaN(parsedTenant) ? parsedTenant : undefined
      );

      User.isAuthenticated = true;
      User.apiLoginResponse = response;

      if (response.user.mustChangePassword) {
        toast.info("Please change your password");
        history.push("/change-password");
        return;
      }

      toast.success("Login successful!");
      history.push("/home");
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Login failed";
      if (typeof message === "string" && message.toLowerCase().includes("tenant")) {
        setShowTenant(true);
      }
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

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
            Cloud operating system for{" "}
            <em>machine shops</em>
          </h1>
          <p>
            Sign in to CimmpleFlow — manufacturing ERP for quoting, production,
            quality, inventory, and accounting in one place.
          </p>
          <div className="login-brand-pills" aria-hidden="true">
            <span>Quoting</span>
            <span>Production</span>
            <span>Quality</span>
            <span>Inventory</span>
            <span>Accounting</span>
          </div>
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
            <h2>Welcome back</h2>
            <p>Sign in to your Cimmple account</p>
          </div>

          <Form className="login-form" onSubmit={handleLogin}>
            <Form.Group className="mb-3">
              <Form.Label>Username</Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter username"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                autoComplete="username"
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Password</Form.Label>
              <Form.Control
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Form.Group>
            {(showTenant || tenantId) && (
              <Form.Group className="mb-3">
                <Form.Label>Tenant ID</Form.Label>
                <Form.Control
                  type="number"
                  placeholder="Required if username exists in multiple tenants"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                />
              </Form.Group>
            )}
            <Button
              type="submit"
              className="w-100 login-submit"
              disabled={isLoading}
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </Form>

          <div className="login-footer-link">
            Vendor? <a href="/vendor/login">Open vendor portal</a>
          </div>
        </div>
      </main>
    </div>
  );
};
