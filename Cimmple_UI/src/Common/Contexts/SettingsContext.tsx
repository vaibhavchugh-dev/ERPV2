import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { SystemSettingsService, SystemSettings } from '../Services/SystemSettingsService';

interface SettingsContextType {
  settings: SystemSettings | null;
  loading: boolean;
  error: string | null;
  refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// Default settings matching current hardcoded values
const getDefaultSettings = (tenantId: number): SystemSettings => ({
  tenantId,
  dateFormat: 'M/d/yyyy',
  timeFormat: '12',
  timezone: 'America/New_York',
  locale: 'en-US',
  defaultCurrency: 'USD',
  currencySymbol: '$',
  decimalPlaces: 2,
  decimalSeparator: '.',
  thousandsSeparator: ',',
  minPasswordLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: false,
  passwordExpirationDays: 90,
  passwordHistoryCount: 5,
  sessionTimeoutMinutes: 30,
  maxConcurrentSessions: 3,
  failedLoginAttempts: 5,
  accountLockoutMinutes: 15,
  smtpServer: '',
  smtpPort: 587,
  smtpUseSsl: true,
  smtpUsername: '',
  smtpPassword: '',
  smtpFromEmail: '',
  smtpFromName: '',
  defaultPageSize: 10,
  enableEmailNotifications: true,
  enableInAppNotifications: true,
});

interface SettingsProviderProps {
  children: ReactNode;
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const storage = JSON.parse(localStorage.getItem('storage') || '{}');
      const tenantId = storage?.tenantID || (process.env.NODE_ENV === 'development' ? 1 : 0);
      const hasToken = !!localStorage.getItem('token');

      if (tenantId === 0 || !hasToken) {
        // No session yet — use defaults (avoid 401 during login)
        setSettings(getDefaultSettings(tenantId || 1));
        setLoading(false);
        return;
      }

      try {
        const loadedSettings = await SystemSettingsService.GetSettings(tenantId);
        setSettings(loadedSettings);
      } catch (err: any) {
        console.warn('[SettingsContext] Failed to load settings, using defaults:', err.message);
        // Use defaults if loading fails - app continues working
        setSettings(getDefaultSettings(tenantId));
      }
    } catch (err: any) {
      console.error('[SettingsContext] Error loading settings:', err);
      setError(err.message);
      // Always provide defaults as fallback
      const storage = JSON.parse(localStorage.getItem('storage') || '{}');
      const tenantId = storage?.tenantID || 1;
      setSettings(getDefaultSettings(tenantId));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const refreshSettings = async () => {
    await loadSettings();
  };

  return (
    <SettingsContext.Provider value={{ settings, loading, error, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = (): SettingsContextType => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

// Helper hook that returns settings with guaranteed defaults
export const useSettingsSafe = (): SystemSettings => {
  // Always call useContext - hooks must be called unconditionally
  const context = useContext(SettingsContext);
  
  // If context is undefined or settings are null, return defaults
  if (!context || !context.settings) {
    const storage = JSON.parse(localStorage.getItem('storage') || '{}');
    const tenantId = storage?.tenantID || 1;
    return getDefaultSettings(tenantId);
  }
  
  return context.settings;
};


