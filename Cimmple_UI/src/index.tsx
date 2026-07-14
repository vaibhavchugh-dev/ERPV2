import "./globals";
import React from "react";
import ReactDOM from "react-dom";
import App from "./App";
import * as serviceWorker from "./serviceWorker";
import { Provider } from "react-redux";
import ReduxStore from "./Redux/Store/IndexStore";
import { SettingsProvider } from "./Common/Contexts/SettingsContext";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-toastify/dist/ReactToastify.css";

ReactDOM.render(
  <Provider store={ReduxStore}>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </Provider>,
  document.getElementById("root")
);

serviceWorker.unregister();
