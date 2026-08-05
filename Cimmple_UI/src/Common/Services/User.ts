import axios from "axios";
import { IUser } from "../Contracts/IUser";
import { API_ROOT } from "./Api-config";
import Instense from "./Axios-config";

export class User {
  public static isAuthenticated = localStorage.getItem("token") !== null;
  public static mergeToken = "";
  public static apiLoginResponse: any = null;

  public static loginNew = async (
    userName: string,
    password: string,
    LoginHID: string,
    Nonce: string = "",
    isFreshDeskRequest: boolean = false
  ): Promise<IUser | null> => {
    const url = `/User/Login`;
    const response = await Instense.post(url, {
      userName,
      password,
      LoginHID,
      Nonce,
      isFreshDeskRequest,
    });
    const loginResponse = response.data;
    User.apiLoginResponse = loginResponse;
    return loginResponse.user;
  };

  public static login = async (
    userName: string,
    password: string,
    LoginHID: string = "",
    Nonce: string = ""
  ): Promise<IUser | null> => {
    return User.loginNew(userName, password, LoginHID, Nonce);
  };

  public static AutoLogin = async (
    userName: string,
    token: string,
    Nonce: string
  ): Promise<any> => {
    const url = `/User/AutoLogin`;
    return Instense.post(url, { userName, token, Nonce }).then((response) => {
      const loginResponse = response.data;
      User.apiLoginResponse = loginResponse;
      return loginResponse;
    });
  };

  public static ValidateUserStatus = async (
    userName: string,
    tenantID: number,
    parentComponent: string
  ): Promise<any | null> => {
    const url = `/User/ValidateUserStatusNew`;
    const response = await Instense.get(
      url + "?userName=" + userName + "&TenantID=" + tenantID
    );
    if (parentComponent === "loginModal" && User.apiLoginResponse !== null) {
      User.settingUserToken(User.apiLoginResponse);
    }
    return response.data;
  };

  public static ChangeOldPassword = async (
    userName: string,
    password: string,
    userId: number
  ): Promise<any> => {
    const url = `${API_ROOT.backendHost}/User/ChangePassword`;
    const response = await axios.post(url, { userName, password, userId });
    return response.data;
  };

  public static ChangePassword = async (
    password: string,
    oldpassword: string
  ): Promise<any | null> => {
    const url = `${API_ROOT.backendHost}/User/ChangePasswordNew`;
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const userName = storage?.userName || "";
    const userId = storage?.tenantID || 0;
    const response = await axios.post(url, { userName, password, userId, oldpassword });
    return response.data;
  };

  public static UnderMaintenance = async (): Promise<any | null> => {
    const url = `${API_ROOT.backendHost}/User/UnderMaintenance`;
    const response = await axios.get(url);
    return response.data;
  };

  public static settingUserToken = (loginResponse: any) => {
    User.isAuthenticated = false;
    User.apiLoginResponse = null;
    localStorage.clear();
    sessionStorage.clear();

    localStorage.setItem("token", loginResponse.token);
    if (loginResponse.expirationTime) {
      localStorage.setItem("expirationTime", loginResponse.expirationTime);
    }

    const user = loginResponse.user;
    const storageKey: any = {
      user_UniqueID: user.user_UniqueID,
      userName: user.userName,
      tenantID: user.tenantID,
      rolId: user.rolId,
      roleName: user.roleName,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone1: user.phone1,
      currentUtcTime: user.currentUtcTime,
      primaryContact: user.primaryContact,
      primaryMethod: user.primaryMethod,
    };

    User.isAuthenticated = true;
    localStorage.setItem("storage", JSON.stringify(storageKey));
  };

  public static RemoveAuthToken = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("storage");
    User.isAuthenticated = false;
    User.apiLoginResponse = null;
  };

  public static removeToken = async (): Promise<any> => {
    User.RemoveAuthToken();
    return {};
  };
}
