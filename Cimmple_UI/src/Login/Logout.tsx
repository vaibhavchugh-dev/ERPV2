import * as React from "react";
import { useEffect } from "react";
import { useHistory } from "react-router-dom";
import { User } from "../Common/Services/User";
import { AuthService } from "../Common/Services/AuthService";

export const Logout: React.FC = () => {
  const history = useHistory();

  useEffect(() => {
    (async () => {
      try {
        await AuthService.logout();
      } catch {
        AuthService.clearSession("erp");
      }
      User.isAuthenticated = false;
      history.push("/login");
    })();
  }, [history]);

  return null;
};
