import moment from 'moment-timezone';
import { SystemSettings } from './Services/SystemSettingsService';

export class Utils {
  public static GetUserToken = (): string | null => {
    return localStorage.getItem("token");
  };

  // Backward compatible - maintains existing behavior
  public static currencyFormat = (value: number, settings?: SystemSettings | null): string => {
    // Use settings if provided, otherwise fall back to defaults
    const currency = settings?.defaultCurrency || 'USD';
    const locale = settings?.locale || 'en-US';
    const decimalPlaces = settings?.decimalPlaces ?? 2;
    
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces
      }).format(value);
    } catch (error) {
      // Fallback to original behavior if Intl fails
      console.warn('Error formatting currency, using fallback:', error);
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(value);
    }
  };

  // Backward compatible - maintains existing behavior
  public static convertUtcToTimezoneFormat = (
    utcDateTime: any,
    timeZone?: string,
    settings?: SystemSettings | null
  ): string => {
    try {
      // Use settings timezone if provided, otherwise use parameter, otherwise default
      const timeZoneValue = settings?.timezone || 
                           (timeZone && timeZone.trim() !== "" ? timeZone : null) || 
                           "America/New_York";
      
      // Use settings date format if available, otherwise default
      const dateFormat = settings?.dateFormat || "MM/DD/YY";
      
      return moment.utc(utcDateTime).tz(timeZoneValue).format(dateFormat);
    } catch (error) {
      console.error("Error in convertUtcToTimezoneFormat:", error);
      return utcDateTime;
    }
  };

  public static getCookie = (name: string): string | null => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
  };

  public static setCookie = (name: string, value: string, days: number): void => {
    let expires = "";
    if (days) {
      const date = new Date();
      date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
      expires = `; expires=${date.toUTCString()}`;
    }
    document.cookie = `${name}=${value || ""}${expires}; path=/`;
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







