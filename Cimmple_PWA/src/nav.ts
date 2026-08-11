export type NavItem = {
  to: string;
  label: string;
  match?: (pathname: string) => boolean;
};

export const PRIMARY_NAV: NavItem[] = [
  {
    to: "/",
    label: "Dashboard",
    match: (pathname) => pathname === "/",
  },
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

