import { API_ROOT } from "./Api-config";
import Instense from "./Axios-config";

export class User {
  public static isAuthenticated = localStorage.getItem("token") !== null;
  public static mergeToken = "";
  public static apiLoginResponse: any = null;

  public static RemoveAuthToken = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("storage");
    User.isAuthenticated = false;
  };

  public static removeToken = async (): Promise<any> => {
    const url = `${API_ROOT.backendHost}/User/Logout`;
    return Instense.post(url, {}).then((response) => {
      return response.data;
    }).catch(() => {
      // Ignore errors on logout
      return {};
    });
  };
}







