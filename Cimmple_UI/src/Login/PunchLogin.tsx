import React from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import { toast } from "react-toastify";
import { User } from "../Common/Services/User";
import { Redirect } from "react-router-dom";
import { Utils } from "../Common/Utilis";
import "./PunchLogin.scss";

const PUNCH_SESSION_COOKIE = "punchSession";
const PUNCH_SESSION_DAYS = 30;
const PUNCH_SESSION_MAX_AGE_MS = PUNCH_SESSION_DAYS * 24 * 60 * 60 * 1000;
const PUNCH_STORAGE_KEY = "punchStorage";
const PUNCH_TOKEN_KEY = "punchToken";

const isPunchSessionExpired = (session: any): boolean => {
  const expiresAt = Number(session?.expiresAt);
  return !expiresAt || Number.isNaN(expiresAt) || Date.now() > expiresAt;
};

const clearPunchSession = () => {
  localStorage.removeItem(PUNCH_STORAGE_KEY);
  localStorage.removeItem(PUNCH_TOKEN_KEY);
  Utils.setCookie(PUNCH_SESSION_COOKIE, "", 0);
};

const buildPunchSessionPayload = (user: any, token: string) => {
  const expiresAt = Date.now() + PUNCH_SESSION_MAX_AGE_MS;

  return {
    user_UniqueID: user.user_UniqueID,
    userName: user.userName,
    tenantID: user.tenantID,
    rolId: user.rolId,
    token,
    companyName: user.companyName || "",
    name: user.companyName || "",
    currentUtcTime: user.currentUtcTime || "",
    timeZone: user.timeZone || user.currentUtcTime || "",
    expiresAt,
  };
};

interface PunchLoginState {
  username: string;
  password: string;
  loading: boolean;
  loggedIn: boolean;
  errorMessage: string;
}

export class PunchLogin extends React.Component<any, PunchLoginState> {
  constructor(props: any) {
    super(props);
    this.state = {
      username: "",
      password: "",
      loading: false,
      loggedIn: false,
      errorMessage: "",
    };
  }

  componentDidMount() {
    this.restorePunchSessionFromCookie();
  }

  restorePunchSessionFromCookie = () => {
    const localSession = localStorage.getItem(PUNCH_STORAGE_KEY);
    const localToken = localStorage.getItem(PUNCH_TOKEN_KEY);
    if (localSession && localToken) {
      try {
        const parsedSession = JSON.parse(localSession);
        if (!isPunchSessionExpired(parsedSession)) {
          this.setState({ loggedIn: true });
          return;
        }
      } catch (error) {
        console.warn("Unable to parse punch session from local storage", error);
      }

      clearPunchSession();
    }

    const rawCookie = Utils.getCookie(PUNCH_SESSION_COOKIE);
    if (!rawCookie) {
      return;
    }

    try {
      const session = JSON.parse(rawCookie);
      if (Number(session?.rolId) !== 1 || !session?.userName || !session?.token || isPunchSessionExpired(session)) {
        clearPunchSession();
        return;
      }

      localStorage.setItem(
        PUNCH_STORAGE_KEY,
        JSON.stringify({
          user_UniqueID: session.user_UniqueID,
          userName: session.userName,
          tenantID: session.tenantID,
          rolId: session.rolId,
          companyName: session.companyName || session.name || "",
          name: session.companyName || session.name || "",
          currentUtcTime: session.currentUtcTime || "",
          timeZone: session.timeZone || session.currentUtcTime || "",
          expiresAt: session.expiresAt,
        })
      );
      localStorage.setItem(PUNCH_TOKEN_KEY, session.token);
      this.setState({ loggedIn: true });
    } catch (error) {
      console.warn("Unable to restore punch session from cookie", error);
    }
  };

  persistPunchSession = (user: any, token: string) => {
    const isAdmin = Number(user?.rolId) === 1;
    const punchSession = buildPunchSessionPayload(user, token);
    const punchStorage = JSON.stringify({
      currentUtcTime: user.currentUtcTime || "",
      timeZone: user.timeZone || user.currentUtcTime || "",
      companyName: user.companyName || "",
      name: user.companyName || "",
      user_UniqueID: user.user_UniqueID,
      userName: user.userName,
      tenantID: user.tenantID,
      rolId: user.rolId,
      expiresAt: punchSession.expiresAt,
    });

    localStorage.setItem(PUNCH_STORAGE_KEY, punchStorage);
    localStorage.setItem(PUNCH_TOKEN_KEY, token);

    Utils.setCookie(
      PUNCH_SESSION_COOKIE,
      encodeURIComponent(JSON.stringify(punchSession)),
      PUNCH_SESSION_DAYS
    );

    if (!isAdmin) {
      Utils.setCookie(PUNCH_SESSION_COOKIE, "", 0);
    }
  };

  handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await this.handlePasswordLogin();
  };

  handlePasswordLogin = async () => {
    const { username, password } = this.state;
    if (!username || !password) {
      toast.error("Please enter username and password.");
      return;
    }

    this.setState({ loading: true });
    try {
      const user = await User.login(username, password, "");
      if (user) {
        const token = User.apiLoginResponse?.token || "";
        if (!token) {
          toast.error("Login succeeded but no session token was returned.");
          return;
        }

        this.persistPunchSession(user, token);
        this.setState({ loggedIn: true });
      } else {
        this.setState({ errorMessage: "Invalid username or password." });
        toast.error("Invalid credentials.");
      }
    } catch (err: any) {
      this.setState({ errorMessage: err?.message || "Login failed." });
      toast.error(`Login failed: ${err.message}`);
    } finally {
      this.setState({ loading: false });
    }
  };

  render() {
    if (this.state.loggedIn) {
      return <Redirect to="/punch-in-out" />;
    }

    return (
      <div className="login-bg">
        <div className="loginnew">
          <div className="form">
            <Form className="frm-section" onSubmit={this.handleSubmit}>
              <span>Cimmple</span>
              <Form.Control
                type="text"
                name="username"
                value={this.state.username}
                onChange={(e) => this.setState({ username: e.target.value })}
                placeholder="Enter username"
                className="form-control inp_text"
              />
              <Form.Control
                type="password"
                name="password"
                value={this.state.password}
                onChange={(e) => this.setState({ password: e.target.value })}
                placeholder="Enter password"
                className="form-control inp_text"
              />
              {this.state.errorMessage && (
                <span className="invalid-feedback">{this.state.errorMessage}</span>
              )}
              <Button
                variant="primary"
                type="submit"
                disabled={this.state.loading}
                style={{ fontFamily: "OpenSans-Semibold" }}
              >
                {this.state.loading ? (
                  <Spinner className="mr-2" as="span" animation="border" size="sm" role="status" aria-hidden="true" />
                ) : null}
                Login
              </Button>
            </Form>
          </div>
        </div>
      </div>
    );
  }
}
