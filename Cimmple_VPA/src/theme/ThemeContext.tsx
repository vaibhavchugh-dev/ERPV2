import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "cimmple-vpa-theme";

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* ignore */
  }
  return "light";
}

function applyThemeClass(theme: ThemeMode) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
    root.setAttribute("data-theme", "dark");
  } else {
    root.classList.remove("dark");
    root.setAttribute("data-theme", "light");
  }
  root.style.colorScheme = theme;
}

/** While > 0, DOM stays light regardless of stored preference (e.g. login). */
let forceLightLocks = 0;

function applyEffectiveTheme(preferred: ThemeMode) {
  applyThemeClass(forceLightLocks > 0 ? "light" : preferred);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const initial = readStoredTheme();
    applyEffectiveTheme(initial);
    return initial;
  });

  const setTheme = useCallback((mode: ThemeMode) => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
    setThemeState(mode);
    applyEffectiveTheme(mode);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: ThemeMode = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      applyEffectiveTheme(next);
      return next;
    });
  }, []);

  // Keep DOM in sync if theme state changes from elsewhere
  useEffect(() => {
    applyEffectiveTheme(theme);
  }, [theme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/** Keep the document in light mode while this component is mounted. Preference is unchanged. */
export function useForceLightTheme() {
  const { theme } = useTheme();
  useEffect(() => {
    forceLightLocks += 1;
    applyEffectiveTheme(theme);
    return () => {
      forceLightLocks = Math.max(0, forceLightLocks - 1);
      applyEffectiveTheme(theme);
    };
  }, [theme]);
}
