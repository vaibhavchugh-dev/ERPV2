import Instense from "./Axios-config";

export interface SystemSettings {
  id?: number;
  tenantId: number;
  
  // Date & Time Settings
  dateFormat: string;
  timeFormat: string; // "12" or "24"
  timezone: string;
  locale: string;
  
  // Currency Settings
  defaultCurrency: string;
  currencySymbol: string;
  decimalPlaces: number;
  
  // Number Formatting
  decimalSeparator: string;
  thousandsSeparator: string;
  
  // Security Settings
  minPasswordLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  passwordExpirationDays: number;
  passwordHistoryCount: number;
  sessionTimeoutMinutes: number;
  maxConcurrentSessions: number;
  failedLoginAttempts: number;
  accountLockoutMinutes: number;
  
  // Email/SMTP Settings
  smtpServer: string;
  smtpPort: number;
  smtpUseSsl: boolean;
  smtpUsername: string;
  smtpPassword: string;
  smtpFromEmail: string;
  smtpFromName: string;
  
  // System Preferences
  defaultPageSize: number;
  enableEmailNotifications: boolean;
  enableInAppNotifications: boolean;
  
  createdDate?: Date;
  updatedDate?: Date;
}

export interface CompanyInfo {
  companyName: string;
  email: string;
  phoneNumber: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  webAddress: string;
}

export class SystemSettingsService {
  public static async GetSettings(tenantId: number): Promise<SystemSettings> {
    const url = `/SystemSettings/GetSettings`;
    const response = await Instense.get(url, {
      params: { tenantId }
    });
    return response.data;
  }

  public static async SaveSettings(settings: SystemSettings): Promise<{ message: string }> {
    const url = `/SystemSettings/SaveSettings`;
    const response = await Instense.post(url, settings);
    return response.data;
  }

  public static async GetCompanyInfo(tenantId: number): Promise<CompanyInfo> {
    const url = `/SystemSettings/GetCompanyInfo`;
    const response = await Instense.get(url, {
      params: { tenantId }
    });
    return response.data;
  }

  public static async SaveCompanyInfo(tenantId: number, companyInfo: CompanyInfo): Promise<{ message: string }> {
    const url = `/SystemSettings/SaveCompanyInfo`;
    const response = await Instense.post(url, {
      tenantId,
      ...companyInfo
    });
    return response.data;
  }
}

















