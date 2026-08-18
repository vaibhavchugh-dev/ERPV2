import { SystemSettings } from './Services/SystemSettingsService';
import { formatCurrency, formatUtcToTimezone } from './Utils/Formatting';

export class Utils {
  public static GetUserToken = (): string | null => {
    return localStorage.getItem("token");
  };

  // Backward compatible - uses System Settings when available
  public static currencyFormat = (value: number, settings?: SystemSettings | null): string => {
    return formatCurrency(value, settings);
  };

  // Backward compatible - uses System Settings when available
  public static convertUtcToTimezoneFormat = (
    utcDateTime: any,
    timeZone?: string,
    settings?: SystemSettings | null
  ): string => {
    return formatUtcToTimezone(utcDateTime, settings, timeZone);
  };

  public static getCookie = (name: string): string | null => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
  };

  public static CapitalizeFirstLetter = (string: string): string => {
    if (string) {
      return string.charAt(0).toUpperCase() + string.slice(1);
    } else {
      return string;
    }
  };

  public static removeInvaildCharFromAmount = (value: string): string => {
    return value.replace(/[^0-9.]/g, '');
  };
}







