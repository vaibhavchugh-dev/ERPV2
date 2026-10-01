interface RefreshButtonProps {
  onRefresh: () => void;
  loading?: boolean;
  label?: string;
}

export function RefreshButton({ onRefresh, loading = false, label = "Refresh" }: RefreshButtonProps) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={loading}
      aria-label={label}
      aria-busy={loading}
      title={label}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm hover:bg-slate-100 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={loading ? "animate-spin" : undefined}
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
    </button>
  );
}
