


export function DashboardPage() {
  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm"
            onClick={() => {
              const event = new CustomEvent('open-drawer');
              window.dispatchEvent(event);
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900 leading-tight">Dashboard</h1>
            <p className="text-xs font-bold tracking-widest text-slate-400 uppercase">Overview</p>
          </div>
        </div>
      </header>
      
      {/* Blank dashboard area as requested */}
    </div>
  );
}
