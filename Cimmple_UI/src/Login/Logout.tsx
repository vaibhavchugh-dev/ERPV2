import * as React from "react";
import { useEffect } from "react";
import { useHistory } from "react-router-dom";
import { User } from "../Common/Services/User";

export const Logout: React.FC = () => {
  const history = useHistory();

  useEffect(() => {
    localStorage.clear();
    User.isAuthenticated = false;
    history.push("/login");
  }, [history]);

  return null;
};
