import type { ReactNode } from "react";

type IconProps = {
  className?: string;
  size?: number;
};

function Svg({ size = 20, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function IconHome(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V9.5" />
    </Svg>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </Svg>
  );
}

export function IconBack(props: IconProps) {
  return (
    <Svg {...props} size={props.size ?? 20}>
      <path d="M15 19l-7-7 7-7" strokeWidth="2.5" />
    </Svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Svg {...props} size={props.size ?? 18}>
      <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeWidth="2.5" />
    </Svg>
  );
}

export function IconQuote(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h5" />
    </Svg>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <Svg {...props} size={props.size ?? 16}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </Svg>
  );
}

export function IconCurrency(props: IconProps) {
  return (
    <Svg {...props} size={props.size ?? 16}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M15.5 9.5c0-1.1-1.57-2-3.5-2s-3.5.9-3.5 2 1.57 2 3.5 2 3.5.9 3.5 2-1.57 2-3.5 2-3.5-.9-3.5-2" />
    </Svg>
  );
}

export function IconBox(props: IconProps) {
  return (
    <Svg {...props} size={props.size ?? 16}>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </Svg>
  );
}

export function IconWrench(props: IconProps) {
  return (
    <Svg {...props} size={props.size ?? 16}>
      <path d="M14.7 6.3a4.5 4.5 0 01-6.4 6.4L4 17l3 3 4.3-4.3a4.5 4.5 0 016.4-6.4l-2.1 2.1-1.4-1.4 2.1-2.1z" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props} size={props.size ?? 16}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l2.5 2.5L16 9" />
    </Svg>
  );
}

export function IconPaperclip(props: IconProps) {
  return (
    <Svg {...props} size={props.size ?? 16}>
      <path d="M21.44 11.05l-8.49 8.49a6 6 0 01-8.49-8.49l8.49-8.49a4 4 0 015.66 5.66l-8.49 8.49a2 2 0 01-2.83-2.83l8.49-8.48" />
    </Svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props} size={props.size ?? 16}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <Svg {...props} size={props.size ?? 16}>
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
    </Svg>
  );
}

export function IconExternal(props: IconProps) {
  return (
    <Svg {...props} size={props.size ?? 14}>
      <path d="M14 5h5v5M19 5l-9 9" />
      <path d="M19 13v5a1 1 0 01-1 1H6a1 1 0 01-1-1V6a1 1 0 011-1h5" />
    </Svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <Svg {...props} size={props.size ?? 18}>
      <path d="M9 6l6 6-6 6" strokeWidth="2.5" />
    </Svg>
  );
}

export function IconVendorBadge(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="12" r="2.2" />
      <path d="M13.5 10.5h5M13.5 13.5h4" />
    </Svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </Svg>
  );
}

export function IconBuilding(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 21V5a2 2 0 012-2h8a2 2 0 012 2v16M4 21h16M16 21V9h4v12" />
      <path d="M8 8h2M8 12h2M8 16h2" />
    </Svg>
  );
}

export function IconNotes(props: IconProps) {
  return (
    <Svg {...props} size={props.size ?? 16}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h6" />
    </Svg>
  );
}
