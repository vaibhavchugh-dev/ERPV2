export type NavItem = {
  to: string;
  label: string;
  match?: (pathname: string) => boolean;
};

export const PRIMARY_NAV: NavItem[] = [
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
];
