import Instense from "./Axios-config";

export interface SignupForm {
  firstName: string;
  lastName: string;
  companyName: string;
  email: string;
}

export class SignupService {
  /** Queues a free-trial signup. The workspace is created in the background and the login details are emailed. */
  public static async register(form: SignupForm): Promise<string> {
    const { data } = await Instense.post<{ message: string }>("/Signup/Register", form);
    return data?.message ?? "";
  }
}
