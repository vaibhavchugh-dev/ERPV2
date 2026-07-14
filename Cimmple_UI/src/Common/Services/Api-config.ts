import { IApiConfig } from "../Contracts/IApiConfig";

const hostname = window && window.location && window.location.hostname;
const app_Root = {} as IApiConfig;

if (hostname.indexOf("localhost") > -1) {
  // Local development API endpoint (matches launchSettings.json applicationUrl)
  app_Root.backendHost = "http://localhost:5172/api";
} else {
  app_Root.backendHost = "https://dev-cimmple.azurewebsites.net/api";
}

export const API_ROOT = app_Root;


