import moment from 'moment-timezone';
import { SystemSettings } from '../Services/SystemSettingsService';
import { getCachedSettings } from './settingsRuntime';
import { getDefaultSystemSettings } from './defaultSystemSettings';

/** UI / .NET-style date formats → moment tokens (d≠day-of-week in moment). */
const MOMENT_DATE_FORMATS: Record<string, string> = {
  'M/d/yyyy': 'M/D/YYYY',
  'MM/dd/yyyy': 'MM/DD/YYYY',
  'dd/MM/yyyy': 'DD/MM/YYYY',
  'yyyy-MM-dd': 'YYYY-MM-DD',
  'MMM d, yyyy': 'MMM D, YYYY',
  'MMMM d, yyyy': 'MMMM D, YYYY',
  'MM/DD/YY': 'MM/DD/YY',
  'MM/DD/YYYY': 'MM/DD/YYYY',
};

export const toMomentDateFormat = (dateFormat?: string | null): string => {
  if (!dateFormat) return 'M/D/YYYY';
  if (MOMENT_DATE_FORMATS[dateFormat]) return MOMENT_DATE_FORMATS[dateFormat];
  return dateFormat
    .replace(/yyyy/g, 'YYYY')
    .replace(/yy/g, 'YY')
    .replace(/dd/g, 'DD')
    .replace(/(^|[^D])d([^D]|$)/g, '$1D$2');
};

const resolveSettings = (settings?: SystemSettings | null): SystemSettings | null => {
  if (settings) return settings;

  const cached = getCachedSettings();
  if (cached) return cached;

  try {
    const storage = JSON.parse(localStorage.getItem('storage') || '{}');
    if (
      storage.defaultCurrency ||
      storage.currencySymbol ||
      storage.locale ||
      storage.decimalPlaces != null
    ) {
      const tenantId = storage.tenantID || 1;
      return {
        ...getDefaultSystemSettings(tenantId),
        defaultCurrency: storage.defaultCurrency || 'USD',
        currencySymbol: storage.currencySymbol || '$',
        locale: storage.locale || 'en-US',
        decimalPlaces: storage.decimalPlaces ?? 2,
      };
    }
  } catch {
    // ignore storage parse failures
  }

  return null;
};

/** Derive display symbol for a currency code (e.g. EUR → €). */
export const deriveCurrencySymbol = (
  currencyCode: string,
  locale = 'en-US'
): string => {
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
    }).formatToParts(1);
    const symbol = parts.find((p) => p.type === 'currency')?.value;
    if (symbol) return symbol;
  } catch {
    // Intl may reject unknown codes
  }

  const fallback: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    CNY: '¥',
    INR: '₹',
    CAD: 'C$',
    AUD: 'A$',
  };
  return fallback[currencyCode] || currencyCode;
};

/** Symbol from system settings (e.g. $, €). */
export const getCurrencySymbol = (settings?: SystemSettings | null): string => {
  const resolved = resolveSettings(settings);
  const currency = resolved?.defaultCurrency || 'USD';
  const locale = resolved?.locale || 'en-US';
  const configured = (resolved?.currencySymbol || '').trim();
  const derived = deriveCurrencySymbol(currency, locale);

  if (!configured) return derived;
  // Common mismatch: currency changed to EUR but symbol field still $
  if (configured === '$' && currency !== 'USD') return derived;
  return configured;
};

/** Column header for discount type picker (percent vs flat amount). */
export const formatDiscountColumnLabel = (settings?: SystemSettings | null): string =>
  `Discount % / ${getCurrencySymbol(settings)}`;

/**
 * Format currency using system settings
 * Falls back to defaults if settings not provided
 */
export const formatCurrency = (
  value: number,
  settings?: SystemSettings | null
): string => {
  const resolved = resolveSettings(settings);
  const currency = resolved?.defaultCurrency || 'USD';
  const locale = resolved?.locale || 'en-US';
  const decimalPlaces = resolved?.decimalPlaces ?? 2;
  const currencySymbol = resolved?.currencySymbol || '$';
  
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
    const formatted = formatNumber(value, resolved);
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
  const resolved = resolveSettings(settings);
  const decimalPlaces = resolved?.decimalPlaces ?? 2;
  const decimalSeparator = resolved?.decimalSeparator || '.';
  const thousandsSeparator = resolved?.thousandsSeparator || ',';
  
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
    const resolved = resolveSettings(settings);
    const dateFormat = toMomentDateFormat(resolved?.dateFormat || 'M/d/yyyy');
    const timezone = resolved?.timezone || 'America/New_York';
    
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
    const resolved = resolveSettings(settings);
    const dateFormat = toMomentDateFormat(resolved?.dateFormat || 'M/d/yyyy');
    const timeFormat = resolved?.timeFormat || '12';
    const timezone = resolved?.timezone || 'America/New_York';
    
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
    const resolved = resolveSettings(settings);
    const timezone = customTimezone || resolved?.timezone || 'America/New_York';
    const dateFormat = toMomentDateFormat(resolved?.dateFormat || 'MM/DD/YY');
    
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

/** Local today in system display format (short year) */
export const todayDateOnlyDisplay = (): string => {
  const resolved = resolveSettings();
  const dateFormat = toMomentDateFormat(resolved?.dateFormat || 'M/d/yyyy');
  return moment().format(dateFormat.replace(/YYYY/g, 'YY'));
};

/** Parse display/API date strings into a moment using system dateFormat (plus ISO). */
const parseDateOnlyMoment = (dateStr: string, settings?: SystemSettings | null) => {
  const raw = String(dateStr).trim();
  if (!raw) return moment.invalid();

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return moment(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`, 'YYYY-MM-DD', true);
  }

  const resolved = resolveSettings(settings);
  const dateFormat = toMomentDateFormat(resolved?.dateFormat || 'M/d/yyyy');
  const shortFormat = dateFormat.replace(/YYYY/g, 'YY');
  const formats = Array.from(
    new Set([
      dateFormat,
      shortFormat,
      'YYYY-MM-DD',
      'M/D/YYYY',
      'MM/DD/YYYY',
      'M/D/YY',
      'MM/DD/YY',
      'D/M/YYYY',
      'DD/MM/YYYY',
      'D/M/YY',
      'DD/MM/YY',
    ])
  );
  return moment(raw, formats, true);
};

/** API/ISO/date string → display date using system settings (calendar parts only, no TZ shift) */
export const formatDateOnlyFromApi = (
  dateStr: string | null | undefined,
  fullYear = false,
  settings?: SystemSettings | null
): string => {
  if (!dateStr) return '';
  try {
    const resolved = resolveSettings(settings);
    const dateFormat = toMomentDateFormat(resolved?.dateFormat || 'M/d/yyyy');
    const momentFormat = fullYear ? dateFormat : dateFormat.replace(/YYYY/g, 'YY');
    const parsed = parseDateOnlyMoment(String(dateStr), settings);
    return parsed.isValid() ? parsed.format(momentFormat) : '';
  } catch {
    return '';
  }
};

/**
 * Parse API/ISO/slash date-only strings as a local calendar Date (no UTC day-shift).
 * Prefer this over `new Date("yyyy-MM-dd")` when comparing to local month/week bounds.
 */
export const parseDateOnlyLocal = (dateStr: string | null | undefined): Date | null => {
  if (!dateStr) return null;
  try {
    const parsed = parseDateOnlyMoment(String(dateStr));
    if (!parsed.isValid()) return null;
    return new Date(parsed.year(), parsed.month(), parsed.date());
  } catch {
    return null;
  }
};

/** Display/ISO date → yyyy-MM-dd for API payloads (no time / no Z) */
export const toDateOnlyApiString = (dateStr: string): string => {
  const padToday = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };
  if (!dateStr) return padToday();
  try {
    const parsed = parseDateOnlyMoment(String(dateStr));
    return parsed.isValid() ? parsed.format('YYYY-MM-DD') : padToday();
  } catch {
    return padToday();
  }
};

/** Display/ISO date → yyyy-MM-dd for HTML date inputs */
export const toHtmlDateInputValue = (dateStr: string): string => {
  if (!dateStr) return '';
  try {
    const parsed = parseDateOnlyMoment(String(dateStr));
    return parsed.isValid() ? parsed.format('YYYY-MM-DD') : '';
  } catch {
    return '';
  }
};

/** HTML date input yyyy-MM-dd → system display format (short year) */
export const fromHtmlDateInputValue = (dateStr: string): string => {
  if (!dateStr) return '';
  try {
    const parsed = moment(String(dateStr).trim(), 'YYYY-MM-DD', true);
    if (!parsed.isValid()) return dateStr;
    const resolved = resolveSettings();
    const dateFormat = toMomentDateFormat(resolved?.dateFormat || 'M/d/yyyy');
    return parsed.format(dateFormat.replace(/YYYY/g, 'YY'));
  } catch {
    return dateStr;
  }
};

















