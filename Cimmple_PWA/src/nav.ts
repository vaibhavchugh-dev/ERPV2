export type NavItem = {
  to: string;
  label: string;
  match?: (pathname: string) => boolean;
};

/** Bottom tab destinations — primary shopfloor switchers. */
export const BOTTOM_TABS: NavItem[] = [
  {
    to: "/jobs",
    label: "Jobs",
    match: (pathname) => pathname === "/jobs" || pathname.startsWith("/jobs/"),
  },
  {
    to: "/quality",
    label: "Quality",
    match: (pathname) =>
      pathname === "/quality" || pathname.startsWith("/quality/"),
  },
  {
    to: "/profile",
    label: "Profile",
    match: (pathname) => pathname === "/profile",
  },
];

/** Secondary drawer links (not duplicated on bottom tabs). */
export const DRAWER_LINKS: NavItem[] = [
  {
    to: "/",
    label: "Dashboard",
    match: (pathname) => pathname === "/",
  },
];

/** @deprecated Use BOTTOM_TABS — kept for any leftover imports */
export const PRIMARY_NAV = BOTTOM_TABS;
