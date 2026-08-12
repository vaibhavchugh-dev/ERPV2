import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useForceLightTheme } from "../theme/ThemeContext";

export function LoginPage() {
  useForceLightTheme();
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [showTenant, setShowTenant] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password) {
      setError("Username and password are required");
      return;
    }

    setLoading(true);
    try {
      const parsedTenant = tenantId ? parseInt(tenantId, 10) : undefined;
      await login(
        username.trim(),
        password,
        parsedTenant && !Number.isNaN(parsedTenant) ? parsedTenant : undefined
      );
      navigate("/", { replace: true });
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } }; message?: string };
      const message =
        ax?.response?.data?.message || ax?.message || "Login failed";
      if (typeof message === "string" && message.toLowerCase().includes("tenant")) {
        setShowTenant(true);
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-[radial-gradient(90%_60%_at_50%_-10%,#dbeafe_0%,transparent_55%),#f4f6f9] p-5">
      <div className="card w-full max-w-[400px] px-5 py-6">
        <div className="mb-5 text-center">
          <img
            src="/logo.svg"
            alt="Cimmple"
            width={56}
            height={56}
            className="mx-auto mb-3 h-14 w-14 object-contain"
          />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Cimmple</h1>
          <p className="mt-1 font-semibold text-slate-500">Shop Floor</p>
        </div>

        <form className="space-y-3.5" onSubmit={handleSubmit}>
          {error && (
            <div
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700"
              role="alert"
            >
              {error}
            </div>
          )}

          <label className="field">
            <span>Username</span>
            <input
              className="field-input"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              className="field-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {(showTenant || tenantId) && (
            <label className="field">
              <span>Tenant ID</span>
              <input
                className="field-input"
                type="number"
                inputMode="numeric"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="Required for multi-tenant"
              />
            </label>
          )}

          <button type="submit" className="btn btn-primary w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
