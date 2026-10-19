import React, { useEffect, useRef, useState } from "react";

const MIN_YEAR = 1900;
const MAX_YEAR = 2999;
const TYPING_COMMIT_DELAY_MS = 800;
const KEY_TO_CHANGE_WINDOW_MS = 100;

const isCompleteDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  return year >= MIN_YEAR && year <= MAX_YEAR;
};

const parseYmd = (value: string): { y: string; m: string; d: string } | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { y: match[1], m: match[2], d: match[3] };
};

type DateFilterInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "defaultValue"
> & {
  /** yyyy-MM-dd, or "" for no date. */
  value: string;
  /** Fired only with a complete, plausible date (or "" when cleared via the picker). */
  onCommit: (value: string) => void;
};

/**
 * Native date input for list/report filters that trigger a reload.
 * Typed input is held as a draft and committed once complete — after a short pause,
 * on Enter, or on blur. Calendar month/year navigation that keeps the same day is
 * not committed until blur/Enter, so changing months does not reload the list before
 * a day is chosen. Selecting a different day commits immediately.
 */
const DateFilterInput: React.FC<DateFilterInputProps> = ({
  value,
  onCommit,
  onBlur,
  onKeyDown,
  ...rest
}) => {
  const [draft, setDraft] = useState(value);
  const lastKeyAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  const commit = (next: string) => {
    clearTimer();
    if (next === value) return;
    if (next === "" || isCompleteDate(next)) {
      onCommit(next);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    const previousDraft = draft;
    setDraft(next);
    clearTimer();
    const isTyping = Date.now() - lastKeyAtRef.current < KEY_TO_CHANGE_WINDOW_MS;

    if (isTyping) {
      if (isCompleteDate(next)) {
        timerRef.current = window.setTimeout(() => commit(next), TYPING_COMMIT_DELAY_MS);
      }
      return;
    }

    if (next === "") {
      commit(next);
      return;
    }
    if (!isCompleteDate(next)) return;

    // Month/year spinner often keeps the same day — hold as draft until blur/Enter.
    const prevParts = parseYmd(previousDraft || value);
    const nextParts = parseYmd(next);
    if (prevParts && nextParts) {
      const monthOrYearChanged = prevParts.y !== nextParts.y || prevParts.m !== nextParts.m;
      const dayUnchanged = prevParts.d === nextParts.d;
      if (monthOrYearChanged && dayUnchanged) {
        return;
      }
    }

    commit(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    lastKeyAtRef.current = Date.now();
    if (e.key === "Enter") {
      commit(draft);
    }
    onKeyDown?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (isCompleteDate(draft) || draft === "") {
      commit(draft);
    } else {
      clearTimer();
      setDraft(value);
    }
    onBlur?.(e);
  };

  return (
    <input
      {...rest}
      type="date"
      value={draft}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  );
};

export default DateFilterInput;
