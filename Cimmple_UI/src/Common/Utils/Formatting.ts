import moment from 'moment-timezone';
import { SystemSettings } from '../Services/SystemSettingsService';

/**
 * Format currency using system settings
 * Falls back to defaults if settings not provided
 */
export const formatCurrency = (
  value: number,
  settings?: SystemSettings | null
): string => {
  const currency = settings?.defaultCurrency || 'USD';
  const locale = settings?.locale || 'en-US';
  const decimalPlaces = settings?.decimalPlaces ?? 2;
  const currencySymbol = settings?.currencySymbol || '$';
  
  try {
    // Try using Intl.NumberFormat first (supports most currencies)
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces
    });
    
    return formatter.format(value);
  } catch (error) {
    // Fallback to manual formatting if Intl fails
    console.warn('Error formatting currency with Intl, using fallback:', error);
    const formatted = formatNumber(value, settings);
    return `${currencySymbol}${formatted}`;
  }
};

/**
 * Format number using system settings (decimal/thousands separators)
 * Falls back to defaults if settings not provided
 */
export const formatNumber = (
  value: number,
  settings?: SystemSettings | null
): string => {
  const decimalPlaces = settings?.decimalPlaces ?? 2;
  const decimalSeparator = settings?.decimalSeparator || '.';
  const thousandsSeparator = settings?.thousandsSeparator || ',';
  
  // Format with correct decimal places
  const fixed = value.toFixed(decimalPlaces);
  const parts = fixed.split('.');
  
  // Add thousands separator
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);
  
  // Combine with decimal separator
  if (parts.length > 1 && decimalPlaces > 0) {
    return `${integerPart}${decimalSeparator}${parts[1]}`;
  }
  
  return integerPart;
};

/**
 * Format date using system settings
 * Falls back to defaults if settings not provided
 */
export const formatDate = (
  date: string | Date | null | undefined,
  settings?: SystemSettings | null
): string => {
  if (!date) return '';
  
  try {
    const dateFormat = settings?.dateFormat || 'M/d/yyyy';
    const timezone = settings?.timezone || 'America/New_York';
    
    // Parse the date
    const dateObj = moment(date);
    
    if (!dateObj.isValid()) {
      return String(date);
    }
    
    // Convert to timezone and format
    return dateObj.tz(timezone).format(dateFormat);
  } catch (error) {
    console.error('Error formatting date:', error);
    // Fallback to simple format
    try {
      return new Date(date as string).toLocaleDateString('en-US');
    } catch {
      return String(date);
    }
  }
};

/**
 * Format date and time using system settings
 * Falls back to defaults if settings not provided
 */
export const formatDateTime = (
  date: string | Date | null | undefined,
  settings?: SystemSettings | null
): string => {
  if (!date) return '';
  
  try {
    const dateFormat = settings?.dateFormat || 'M/d/yyyy';
    const timeFormat = settings?.timeFormat || '12';
    const timezone = settings?.timezone || 'America/New_York';
    
    const dateObj = moment(date);
    
    if (!dateObj.isValid()) {
      return String(date);
    }
    
    // Build format string
    let formatString = dateFormat;
    
    if (timeFormat === '12') {
      formatString += ' h:mm A'; // 12-hour with AM/PM
    } else {
      formatString += ' HH:mm'; // 24-hour
    }
    
    return dateObj.tz(timezone).format(formatString);
  } catch (error) {
    console.error('Error formatting date/time:', error);
    try {
      return new Date(date as string).toLocaleString('en-US');
    } catch {
      return String(date);
    }
  }
};

/**
 * Format UTC date/time to timezone using system settings
 * Falls back to defaults if settings not provided
 */
export const formatUtcToTimezone = (
  utcDateTime: any,
  settings?: SystemSettings | null,
  customTimezone?: string
): string => {
  try {
    const timezone = customTimezone || settings?.timezone || 'America/New_York';
    const dateFormat = settings?.dateFormat || 'MM/DD/YY';
    
    return moment.utc(utcDateTime).tz(timezone).format(dateFormat);
  } catch (error) {
    console.error('Error in formatUtcToTimezone:', error);
    return String(utcDateTime);
  }
};

















