import React, { useState } from "react";
import { Form, Button } from "react-bootstrap";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { AuthService } from "../Common/Services/AuthService";
import "../Login/Login.scss";

export const VendorLogin: React.FC = () => {
  const history = useHistory();
  const [vendorCode, setVendorCode] = useState("");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (!vendorCode) {
        toast.error("Vendor code is required");
        return;
      }

      const parsedTenant = tenantId ? parseInt(tenantId, 10) : undefined;
      await AuthService.vendorLogin(
        vendorCode.trim(),
        password,
        parsedTenant && !isNaN(parsedTenant) ? parsedTenant : undefined
      );

      toast.success("Login successful!");
      history.push("/vendor/dashboard");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <aside className="login-brand" aria-label="Cimmple vendor portal">
        <div className="login-brand-top">
          <div className="login-brand-mark">
            <img src="/logo.svg" alt="" />
            <span>Cimmple</span>
          </div>
        </div>

        <div className="login-brand-copy">
          <h1>
            Vendor portal for{" "}
            <em>quotations</em>
          </h1>
          <p>
            Review RFQs, submit pricing, and collaborate with machine shops
            running on CimmpleFlow.
          </p>
          <div className="login-brand-pills" aria-hidden="true">
            <span>RFQs</span>
            <span>Quotes</span>
            <span>Responses</span>
          </div>
        </div>

        <div className="login-brand-foot">
          <span>Supplier access for Cimmple shops</span>
          <a href="https://www.cimmple.com/" target="_blank" rel="noopener noreferrer">
            cimmple.com
          </a>
        </div>
      </aside>

      <main className="login-panel">
        <div className="login-panel-inner">
          <div className="login-panel-header">
            <h2>Vendor sign in</h2>
            <p>Use your vendor code and portal password</p>
          </div>

          <Form className="login-form" onSubmit={handleLogin}>
            <Form.Group className="mb-3">
              <Form.Label>Vendor Code</Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter your vendor code"
                value={vendorCode}
                onChange={(e) => setVendorCode(e.target.value)}
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
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Tenant ID (optional)</Form.Label>
              <Form.Control
                type="number"
                placeholder="Only if required"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
              />
            </Form.Group>
            <Button
              type="submit"
              className="w-100 login-submit"
              disabled={isLoading}
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </Form>

          <div className="login-footer-link">
            Employee? <a href="/login">Back to main portal</a>
          </div>
        </div>
      </main>
    </div>
  );
};
