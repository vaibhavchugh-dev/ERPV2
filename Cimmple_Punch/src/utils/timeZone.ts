import { getSessionTimeZone } from "../services/authService";

/** Format a UTC timestamp for display in the logged-in tenant timezone. */
export const formatTimeInSessionZone = (
  value?: string,
  timeZone?: string
): string => {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const resolvedTimeZone = (timeZone?.trim() || getSessionTimeZone()).trim();

  try {
    return new Intl.DateTimeFormat([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: resolvedTimeZone,
    }).format(date);
  } catch {
    try {
      return new Intl.DateTimeFormat([], {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: getSessionTimeZone(),
      }).format(date);
    } catch {
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
    }
  }
};

/** Live clock date/time parts in the session timezone. */
export const getSessionDateTimeParts = (value: Date, timeZone?: string) => {
  const resolvedTimeZone = (timeZone?.trim() || getSessionTimeZone()).trim();

  try {
    const time = new Intl.DateTimeFormat([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZone: resolvedTimeZone,
    }).format(value);

    const date = new Intl.DateTimeFormat([], {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: resolvedTimeZone,
    }).format(value);

    return { time, date };
  } catch {
    return {
      time: value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }),
      date: value.toLocaleDateString([], {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    };
  }
};
