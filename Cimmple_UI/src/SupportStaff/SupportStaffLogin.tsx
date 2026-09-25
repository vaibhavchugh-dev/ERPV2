import React, { useState } from "react";
import { Form, Button } from "react-bootstrap";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { SupportStaffAuth } from "./SupportStaffAuth";
import PasswordInput from "../Common/Components/PasswordInput";
import "../Login/Login.scss";

export const SupportStaffLogin: React.FC = () => {
  const history = useHistory();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      toast.error("Enter username and password.");
      return;
    }
    setLoading(true);
    try {
      await SupportStaffAuth.login(username.trim(), password);
      toast.success("Signed in.");
      history.replace("/support");
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || err?.message || "Login failed."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <aside className="login-brand" aria-label="Cimmple support">
        <div className="login-brand-top">
          <div className="login-brand-mark">
            <img src="/logo.svg" alt="" />
            <span>Cimmple</span>
          </div>
        </div>
        <div className="login-brand-copy">
          <h1>
            Support inbox for <em>all products</em>
          </h1>
          <p>
            Cimmple staff access to cross-tenant tickets from CimmpleFlow and
            future products.
          </p>
        </div>
        <div className="login-brand-foot">
          <span>Staff only</span>
          <a href="https://www.cimmple.com/" target="_blank" rel="noopener noreferrer">
            cimmple.com
          </a>
        </div>
      </aside>

      <main className="login-panel">
        <div className="login-panel-inner">
          <div className="login-panel-header">
            <h2>Support staff sign in</h2>
            <p>Use your Cimmple support credentials</p>
          </div>

          <Form className="login-form" onSubmit={onSubmit}>
            <Form.Group className="mb-3">
              <Form.Label>Username</Form.Label>
              <Form.Control
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Password</Form.Label>
              <PasswordInput
                className="form-control"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Form.Group>
            <Button type="submit" className="w-100 login-submit" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </Form>
        </div>
      </main>
    </div>
  );
};

export default SupportStaffLogin;
