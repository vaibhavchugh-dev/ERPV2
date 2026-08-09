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

/**
 * Date-only helpers for Order/Quotation calendar fields.
 * Avoid Date/toISOString timezone shifts that move the calendar day.
 */

/** Local today as MM/DD/YY */
export const todayDateOnlyDisplay = (): string => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
};

/** API/ISO/date string → MM/DD/YY (or MM/DD/YYYY) using calendar parts only */
export const formatDateOnlyFromApi = (
  dateStr: string | null | undefined,
  fullYear = false
): string => {
  if (!dateStr) return '';
  try {
    const raw = String(dateStr).trim();
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const year = fullYear ? isoMatch[1] : isoMatch[1].slice(-2);
      return `${isoMatch[2]}/${isoMatch[3]}/${year}`;
    }
    const slashParts = raw.split('/');
    if (slashParts.length === 3) {
      const month = slashParts[0].padStart(2, '0');
      const day = slashParts[1].padStart(2, '0');
      let year = slashParts[2];
      if (year.length === 2 && fullYear) year = `20${year}`;
      if (year.length > 2 && !fullYear) year = year.slice(-2);
      return `${month}/${day}/${year}`;
    }
    return '';
  } catch {
    return '';
  }
};

/** MM/DD/YY (or ISO) → yyyy-MM-dd for API payloads (no time / no Z) */
export const toDateOnlyApiString = (dateStr: string): string => {
  const padToday = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };
  if (!dateStr) return padToday();
  try {
    const raw = String(dateStr).trim();
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

    const parts = raw.split('/');
    if (parts.length === 3) {
      const month = parts[0].padStart(2, '0');
      const day = parts[1].padStart(2, '0');
      let year = parseInt(parts[2], 10);
      if (Number.isNaN(year)) return padToday();
      if (parts[2].length <= 2) year += 2000;
      return `${year}-${month}-${day}`;
    }
    return padToday();
  } catch {
    return padToday();
  }
};

/** MM/DD/YY → yyyy-MM-dd for HTML date inputs */
export const toHtmlDateInputValue = (dateStr: string): string => {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const month = parts[0].padStart(2, '0');
      const day = parts[1].padStart(2, '0');
      const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
      return `${year}-${month}-${day}`;
    }
    const isoMatch = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    return dateStr;
  } catch {
    return '';
  }
};

/** HTML date input yyyy-MM-dd → MM/DD/YY */
export const fromHtmlDateInputValue = (dateStr: string): string => {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      return `${month}/${day}/${year.slice(-2)}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
};

















