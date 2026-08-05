import * as React from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import { BrowserRouter as Router, Switch, Route } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import { ProtectedLayout } from "./Common/Components/ProtectedLayout";
import { Login } from "./Login/Login";
import { Logout } from "./Login/Logout";
import { PunchLogin } from "./Login/PunchLogin";
import PunchInOut from "./Modules/PunchInOut/PunchInOut";
import VendorProtectedLayout from "./VendorPortal/VendorProtectedLayout";
import { useSettingsSafe } from "./Common/Contexts/SettingsContext";
import "./App.scss";
import "react-toastify/dist/ReactToastify.css";
import moment from 'moment-timezone';

const AppContent: React.FC = () => {
  const settings = useSettingsSafe();
  
  React.useEffect(() => {
    // Set default timezone from settings
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
        <Switch>
          <Route exact path="/login" component={Login} />
          <Route exact path="/punch-login" component={PunchLogin} />
          <Route exact path="/punch-in-out" component={PunchInOut} />
          <Route exact path="/logout" component={Logout} />
          <Route path="/vendor" component={VendorProtectedLayout} />
          <Route path="/" component={ProtectedLayout} />
        </Switch>
      </Router>
    </div>
  );
};

const App: React.FC = () => {
  return <AppContent />;
};

export default App;
