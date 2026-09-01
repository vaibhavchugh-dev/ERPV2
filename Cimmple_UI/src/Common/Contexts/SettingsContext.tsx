import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { SystemSettingsService, SystemSettings } from '../Services/SystemSettingsService';
import { applyRuntimeSettings, getCachedSettings } from '../Utils/settingsRuntime';
import { getDefaultSystemSettings } from '../Utils/defaultSystemSettings';

interface SettingsContextType {
  settings: SystemSettings | null;
  loading: boolean;
  error: string | null;
  refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// Default settings matching current hardcoded values
const getDefaultSettings = getDefaultSystemSettings;

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
        // No session yet — use defaults in React only (avoid 401 during login).
        // Do not write defaults into localStorage; that overwrites login session values.
        const defaults = getDefaultSettings(tenantId || 1);
        setSettings(defaults);
        setLoading(false);
        return;
      }

      try {
        const loadedSettings = await SystemSettingsService.GetSettings(tenantId);
        setSettings(loadedSettings);
        applyRuntimeSettings(loadedSettings);
      } catch (err: any) {
        console.warn('[SettingsContext] Failed to load settings, using defaults:', err.message);
        // Use defaults in React, but keep any sessionTimeoutMinutes already set by login
        const defaults = getDefaultSettings(tenantId);
        try {
          const existing = JSON.parse(localStorage.getItem('storage') || '{}');
          if (Number(existing.sessionTimeoutMinutes) > 0) {
            defaults.sessionTimeoutMinutes = Number(existing.sessionTimeoutMinutes);
          }
        } catch {
          // ignore
        }
        setSettings(defaults);
        applyRuntimeSettings(defaults);
      }
    } catch (err: any) {
      console.error('[SettingsContext] Error loading settings:', err);
      setError(err.message);
      // Always provide defaults as fallback
      const storage = JSON.parse(localStorage.getItem('storage') || '{}');
      const tenantId = storage?.tenantID || 1;
      const defaults = getDefaultSettings(tenantId);
      setSettings(defaults);
      applyRuntimeSettings(defaults);
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

  if (context?.settings) {
    return context.settings;
  }

  const cached = getCachedSettings();
  if (cached) {
    return cached;
  }

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
        ...getDefaultSettings(tenantId),
        defaultCurrency: storage.defaultCurrency || 'USD',
        currencySymbol: storage.currencySymbol || '$',
        locale: storage.locale || 'en-US',
        decimalPlaces: storage.decimalPlaces ?? 2,
      };
    }
  } catch {
    // ignore storage parse failures
  }

  const storage = JSON.parse(localStorage.getItem('storage') || '{}');
  const tenantId = storage?.tenantID || 1;
  return getDefaultSettings(tenantId);
};
