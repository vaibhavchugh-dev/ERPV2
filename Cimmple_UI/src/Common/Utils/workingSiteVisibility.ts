/**
 * TopBar working-site switcher visibility by route.
 * Operational lists follow the working site; tenant-wide / setup pages hide it.
 */
export function shouldShowWorkingSiteSwitcher(pathname: string): boolean {
  const path = (pathname || "").toLowerCase().split("?")[0];

  // Masters (Bank / Employee still offer an on-page Site filter when needed)
  if (path === "/masters" || path.startsWith("/masters/")) return false;

  // Settings
  if (path === "/settings" || path.startsWith("/settings/")) return false;

  // GL account activity, period close & GL audit
  if (path === "/accounts/general-ledger" || path.startsWith("/accounts/general-ledger/"))
    return false;
  if (path === "/accounts/periods" || path.startsWith("/accounts/periods/")) return false;

  // NCR codes master (tenant-wide codes)
  if (path === "/quality/ncr-codes" || path.startsWith("/quality/ncr-codes/")) return false;

  return true;
}
