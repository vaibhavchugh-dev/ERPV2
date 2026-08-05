import axios from "axios";
import { IUser } from "../Contracts/IUser";
import { API_ROOT } from "./Api-config";
import Instense from "./Axios-config";
import { AuthService } from "./AuthService";

export class User {
  public static isAuthenticated = localStorage.getItem("token") !== null;
  public static mergeToken = "";
  public static apiLoginResponse: any = null;

  public static RemoveAuthToken = () => {
    AuthService.clearSession("erp");
    User.isAuthenticated = false;
  };

  public static removeToken = async (): Promise<any> => {
    try {
      await AuthService.logout();
    } catch {
      // ignore
    }
    User.isAuthenticated = false;
    return {};
  };

  public static UnderMaintenance = async (): Promise<any> => {
    const url = `/User/UnderMaintenance`;
    return Instense.get(url).then((response) => response.data);
  };
}
