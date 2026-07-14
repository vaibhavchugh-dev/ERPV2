import { useSettingsSafe } from '../Contexts/SettingsContext';
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatUtcToTimezone } from '../Utils/Formatting';

/**
 * Hook that provides formatting functions with settings automatically applied
 * Use this in components for easy access to formatted values
 */
export const useFormatting = () => {
  const settings = useSettingsSafe();

  return {
    /**
     * Format currency using system settings
     */
    formatCurrency: (value: number) => formatCurrency(value, settings),
    
    /**
     * Format date using system settings
     */
    formatDate: (date: string | Date | null | undefined) => formatDate(date, settings),
    
    /**
     * Format date and time using system settings
     */
    formatDateTime: (date: string | Date | null | undefined) => formatDateTime(date, settings),
    
    /**
     * Format number using system settings (decimal/thousands separators)
     */
    formatNumber: (value: number) => formatNumber(value, settings),
    
    /**
     * Format UTC date/time to timezone using system settings
     */
    formatUtcToTimezone: (utcDateTime: any, customTimezone?: string) => 
      formatUtcToTimezone(utcDateTime, settings, customTimezone),
    
    /**
     * Get settings for direct access if needed
     */
    settings,
  };
};

















