import * as React from "react";
import { BrowserRouter as Router, Switch, Route } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import { Login } from "./Login/Login";
import { Logout } from "./Login/Logout";
import { ChangePassword } from "./Login/ChangePassword";
import { useSettingsSafe } from "./Common/Contexts/SettingsContext";
import "./App.scss";
import moment from "moment-timezone";

const ProtectedLayout = React.lazy(() =>
  import("./Common/Components/ProtectedLayout").then((m) => ({ default: m.ProtectedLayout }))
);
const VendorProtectedLayout = React.lazy(() => import("./VendorPortal/VendorProtectedLayout"));

const RouteFallback: React.FC = () => (
  <div className="route-loading" style={{ padding: "2rem", textAlign: "center" }}>
    Loading…
  </div>
);

const AppContent: React.FC = () => {
  const settings = useSettingsSafe();

  React.useEffect(() => {
    const timezone = settings?.timezone || "America/New_York";
    moment.tz.setDefault(timezone);
  }, [settings?.timezone]);

  return (
    <div>
      <ToastContainer
        position="bottom-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
      <Router>
        <React.Suspense fallback={<RouteFallback />}>
          <Switch>
            <Route exact path="/login" component={Login} />
            <Route exact path="/logout" component={Logout} />
            <Route exact path="/change-password" component={ChangePassword} />
            <Route path="/vendor" component={VendorProtectedLayout} />
            <Route path="/" component={ProtectedLayout} />
          </Switch>
        </React.Suspense>
      </Router>
    </div>
  );
};

const App: React.FC = () => {
  return <AppContent />;
};

export default App;
