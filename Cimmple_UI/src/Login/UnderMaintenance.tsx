import * as React from "react";
import { Button } from "react-bootstrap";
import { User } from "../Common/Services/User";
import "./Login.scss";

export const UnderMaintenance: React.FC = () => {
  const [checking, setChecking] = React.useState(false);

  const checkAgain = async () => {
    setChecking(true);
    try {
      const result: any = await User.UnderMaintenance();
      if (!(result?.message === "success" && result?.result === 1)) {
        window.location.href = "/login";
        return;
      }
    } catch {
      // still unavailable
    }
    setChecking(false);
  };

  return (
    <div className="login-page">
      <main className="login-panel">
        <div className="login-panel-inner">
          <div className="login-panel-header">
            <h2>Under maintenance</h2>
            <p>Cimmple is being updated. Please try again in a few minutes.</p>
          </div>
          <Button
            type="button"
            className="w-100 login-submit"
            disabled={checking}
            onClick={() => void checkAgain()}
          >
            {checking ? "Checking..." : "Try again"}
          </Button>
        </div>
      </main>
    </div>
  );
};
