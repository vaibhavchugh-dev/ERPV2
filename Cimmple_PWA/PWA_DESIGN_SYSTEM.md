# Cimmple PWA — Design, Style, and Format Guide

Copy this file into the new PWA repo and treat it as the visual and UX source of truth. It documents how **Cimmple_PWA** (Shop Floor) looks and behaves so a new app can match it without cloning ERP desktop screens.

This is **not** a product spec for jobs/NCR. It is the **look, layout, and interaction language**.

---

## 1. Product feel (do not regress)

1. **Phone-first (~375px).** Design at 375px width first. Tablet is secondary.
2. **Companion app, not a responsive ERP.** No data grids, no desktop sidebar, no dense tables, no slideouts cloned from office UI.
3. **Few screens, big actions.** Large tap targets, short scan paths, one primary task per screen.
4. **Cards, not tables.** Lists are tappable cards. Full card tap navigates to detail.
5. **Bottom tabs for primary destinations only.** Keep the set small (4 or fewer).
6. **Bottom sheets for filters, confirms, scanners.** Never use centered desktop modals on phone.
7. **48px+ tap targets** (`min-h-tap`) on anything operators hit under time pressure.
8. **Safe-area aware.** Notch, status bar, and home indicator must never cover controls.

---

## 2. Recommended stack (match Cimmple_PWA)

| Piece | Choice |
|--------|--------|
| Framework | React 18 + TypeScript |
| Bundler | Vite |
| Styling | Tailwind CSS 3 + a small `@layer components` in `src/index.css` |
| Routing | `react-router-dom` v6 |
| PWA | `vite-plugin-pwa` (`registerType: "autoUpdate"`) |
| Font | **Source Sans 3** (400 / 600 / 700) via Google Fonts |

Do **not** use Bootstrap, Material UI, or Cimmple_UI SCSS. The PWA visual language is Tailwind utilities + a handful of shared classes.

---

## 3. Color tokens

### Semantic palette (Tailwind `theme.extend.colors`)

| Token | Hex | Use |
|--------|-----|-----|
| `brand` | `#1e293b` | Ink / chrome (slate-800) |
| `brand.muted` | `#334155` | Secondary ink |
| `accent` | `#2563eb` | Links, focus, login submit, filter count badge |
| `accent.soft` | `#eff6ff` | Active drawer item wash |
| `surface` | `#ffffff` | Cards |
| `surface.dark` | `#1e293b` | Dark cards (`slate-800`) |
| `canvas` | `#f4f6f9` | Page background |
| `canvas.dark` | `#020617` | Dark page (`slate-950`) |

### Light mode (authenticated app)

| Role | Value |
|------|--------|
| Page canvas | `#f4f6f9` with a soft top wash `#eef2f7` → `#f4f6f9` |
| Card | White, **no visible border in component class**; list cards often add `border-slate-200` |
| Primary text | `slate-900` |
| Secondary text | `slate-500` |
| Muted / labels | `slate-400`–`slate-500` |
| Hairlines | `slate-200` / `slate-100` |
| Search / chip wells | `#f0f3f7` or `#f4f6f8` / `#f1f5f9` |
| Primary button | `slate-900` (black) on white; hover `slate-800` |
| Success action | `#00a86b` / `emerald-500` (Start / positive) |
| Danger | `red-50` fill, `red-700` text, `red-200` border |
| Focus ring | `blue-400` border + `ring-2 ring-blue-200` |

### Dark mode

- Mechanism: **`class` on `<html>`** (`html.dark`), not `prefers-color-scheme` alone.
- Persist in `localStorage` (Shop Floor key: `cimmple-pwa-theme`, values `light` | `dark`).
- Body: `slate-950`, text `slate-100`, no canvas gradient.
- Cards: `slate-800`, border `slate-600`/`slate-700`.
- Inputs: `slate-800` fill, `slate-500` border, `slate-50` text.
- Primary buttons invert: **white fill, slate-900 text**.
- Boost muted contrast: in dark, `text-slate-400` and `text-slate-500` should read as `#cbd5e1` so operators can scan at arm’s length.

### Status / severity colors

| Meaning | Fill (light) | Text (light) | Dark fill / text |
|--------|----------------|--------------|------------------|
| In progress / active | `blue-100` / `blue-100/50` | `blue-700` / `blue-600` | `blue-950/50` / `blue-300` |
| Done / complete | `emerald-50`–`emerald-100` | `emerald-600`–`emerald-700` | `emerald-950/50` / `emerald-300` |
| Idle / draft | `slate-100` | `slate-500`–`slate-600` | `slate-700` / `slate-200` |
| Warn / hold / major | `orange-50` / `amber-100` | `orange-600` / `amber-700` | `orange-950/50` / `orange-300` |
| Critical / urgent | `red-50`–`red-100` | `red-600`–`red-700` | `red-950/60` / `red-300` |
| Shipped | `teal-100` | `teal-700` | `teal-950/50` / `teal-300` |

**Priority:** hide **Normal**. Show **High** (amber) and **Urgent** (red) only.

### Login screen (always light / dark-navy — ignore app theme)

Login is a separate visual world. Force light theme while login is mounted.

| Role | Value |
|------|--------|
| Backdrop | `#070b16` + full-bleed photo + `#070b16/85` overlay |
| Accent glow | Radial `rgba(37,99,235,0.18)` at top |
| Brand mark | Circle `#172338`, cyan-400 star icon, `blue-400/30` ring |
| Headline accent | Gradient `from-blue-400 via-cyan-300 to-indigo-300` |
| Lead / footer | `#94a3b8` |
| Feature chips | `#182338`, `slate-700/50` border, `#cbd5e1` text |
| Form card | `rgb(24 33 54 / 0.95)`, `slate-800/80` border, blur 12px |
| Inputs | `#0e1424`, white text, `slate-700/60` border |
| Input icons | `#22d3ee` (cyan) |
| Submit | `#2563eb`, hover `#1d4ed8`, blue glow shadow |
| Error | `red-500/10` fill, `red-500/30` border, `#fecaca` text |

---

## 4. Typography

**Family:** `"Source Sans 3", "Segoe UI", system-ui, sans-serif`

Load in `index.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap"
  rel="stylesheet"
/>
```

Body: `font-sans text-slate-900 antialiased` (light).

| Role | Typical classes |
|------|-----------------|
| Page title | `text-xl` or `text-2xl` `font-bold` or `font-extrabold` `tracking-tight` `leading-tight` |
| Section title | `text-lg font-black tracking-tight` |
| Eyebrow / kicker | `text-[0.65rem]`–`text-xs` `font-extrabold` or `font-bold` `uppercase tracking-widest` `text-slate-400` |
| Card ID (JO#, NCR#) | `text-lg font-black tracking-tight` |
| Card subtitle | `text-sm`–`text-base` `font-semibold` `text-slate-500` |
| Body | `text-sm font-semibold` |
| Meta chips | `text-sm font-extrabold` |
| Tab labels | `text-[0.7rem] font-bold` |
| Badges | `text-[0.65rem]`–`text-[0.7rem]` `font-extrabold` `uppercase` `tracking-widest` or `tracking-wider` |
| Stat numbers | `text-2xl`–`text-4xl` `font-black leading-none` |

Weight language: **semibold for labels**, **bold for UI chrome**, **extrabold/black for IDs and numbers**. Prefer tight tracking on titles (`tracking-tight`). Prefer wide tracking on uppercase labels (`tracking-widest` or `tracking-[0.14em]`–`tracking-[0.2em]`).

---

## 5. Spacing, radius, elevation, tap size

| Token | Value |
|--------|--------|
| Content max width | **600px** (`max-w-[600px]`), centered |
| Page horizontal pad | `px-4` |
| Page top pad | `pt-[calc(1.5rem+env(safe-area-inset-top,0px))]` |
| Page bottom pad | `pb-[calc(68px+2rem+env(safe-area-inset-bottom,0px))]` (clears 68px tab bar) |
| Card padding | `p-4`–`p-5` (list cards); forms `p-5` |
| List gap | Jobs `space-y-4`; denser lists `space-y-2.5` |
| Grid stats | `gap-2`–`gap-3` |
| Tap min height | **48px** — Tailwind `minHeight.tap = "48px"` → class `min-h-tap` |
| Icon-only buttons | `h-10 w-10` or `h-11 w-11`, usually `rounded-full` |
| Bottom tab bar | **68px** content height + `env(safe-area-inset-bottom)` |
| Drawer width | `300px`, `max-w-[85vw]` |

### Radius

| Element | Radius |
|--------|--------|
| Cards / list items | `rounded-3xl` (1.5rem) |
| Form sections / sheets | `rounded-3xl` / sheet top `rounded-t-3xl` |
| Inputs | `rounded-2xl` |
| Buttons (global `.btn`) | `rounded-full` |
| Large in-page actions | `rounded-2xl` (Start/Pause/Complete, New NCR) |
| Chips / tabs / badges | `rounded-full` |
| Meta qty/due pills | `rounded-xl` |
| Stat cells | `rounded-2xl` |
| Drawer nav rows | `rounded-2xl` |
| Login card / inputs | `clamp(0.9rem, 2.4vw, 1.25rem)` / `0.75rem` |

### Shadows

```js
boxShadow: {
  card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.06)",
  "card-dark": "0 2px 8px rgba(0, 0, 0, 0.35), 0 8px 24px rgba(0, 0, 0, 0.25)",
}
```

- Shared `.card` class: `shadow-[0_4px_24px_rgba(0,0,0,0.04)]` (light), stronger dark equivalent.
- List cards often: `shadow-[0_2px_12px_rgba(15,23,42,0.08)]`.
- Pressed cards: `active:scale-[0.98]`. Hero CTAs: `active:scale-[0.985]`.
- Alert cards: slight `hover:-translate-y-0.5`.

---

## 6. Shared CSS component classes

Put these in `src/index.css` `@layer components` so pages stay consistent.

```css
.btn          /* min-h-tap, rounded-full, px-5, font-bold, disabled:opacity-60 */
.btn-primary  /* slate-900 / white text; dark: white / slate-900 */
.btn-secondary /* white, border-slate-300 */
.btn-success  /* emerald-500 white text */
.btn-ghost    /* white, border-slate-200, slate-700 */
.btn-danger   /* red-50 / red-700 */

.field        /* flex-col gap-1.5 text-sm font-semibold */
.field-input  /* min-h-11 rounded-2xl border-slate-200 px-4 text-base focus:blue */

.card         /* rounded-3xl white + soft shadow */

.badge        /* pill, 0.7rem, extrabold, uppercase, tracking-widest */
.badge-active | .badge-done | .badge-idle | .badge-warn | .badge-critical
```

Full implementations to copy are in **Appendix A**.

On forms, labels often override to `text-sm font-bold text-slate-500` with `field-input min-h-12 ... font-semibold`.

---

## 7. App chrome (shell)

### Authenticated layout

```
┌─────────────────────────────┐
│  safe-area top               │
│  page content (max 600px)   │
│                              │
│  (scroll)                    │
│                              │
├─────────────────────────────┤
│  Bottom tabs 68px + inset    │  fixed, z-40
└─────────────────────────────┘
```

- Column flex, `min-h-dvh`, `bg-canvas`.
- **No persistent top app bar.** Each page owns its header (hamburger + title).
- Open the drawer with `window.dispatchEvent(new CustomEvent("open-drawer"))`.

### Page header pattern

```
[ ☰ circular 40–44px ]  Title (xl, bold, tight)
                             Subtitle (xs, slate-500)  e.g. “Shop floor”
```

- Hamburger: white (or `slate-800` dark) circle, `shadow-sm`, 3-line icon `strokeWidth="2.5"`.
- Optional right slot: Refresh, avatar initials, status select.

### Bottom tabs

- `fixed bottom-0`, `bg-white/95 backdrop-blur-md`, `border-t border-slate-200/80`.
- Inner row `h-[68px] max-w-[600px]`.
- Each tab: icon 22px stroke-2 + label `text-[0.7rem] font-bold`.
- Active: `text-slate-900` (dark: white). Inactive: `text-slate-500`.
- Icons: inline SVG, `fill="none"`, `stroke="currentColor"`, round caps. No icon font.

### Nav drawer (left)

- Overlay `bg-slate-900/20 backdrop-blur-sm`.
- Panel slides from left, `shadow-2xl`.
- Header: app name `font-extrabold` + operator name `text-xs`.
- Active link: `bg-[#eff4ff] text-[#1e3a8a]` (dark: `slate-800` / `blue-300`).
- Footer: Appearance toggle (pill switch, blue-600 when on) + Logout (`text-red-700`) + version chip (`bg-[#f8fafc]`, 40px black circle with a letter mark).
- Lock body scroll while open; Escape closes.

Z-index: tabs `z-40`, drawer/sheets `z-50`.

---

## 8. Screen patterns

### A. Dashboard / home

- Soft radial blue wash behind the header (`rgba(37,99,235,0.14)`), fade into canvas.
- Optional **hero CTA** (e.g. Scan): dark slate-950 rounded ~`1.75rem`, conic blue/sky rim, white/10 icon tile, uppercase sky kicker, `font-black` title.
- Section: title + uppercase meta + “View all” pill (`rounded-full border`, `text-xs font-extrabold`).
- Compact tiles: 3-column grid, `rounded-2xl`, `min-h-[3.75rem]`, centered ID, `font-black`.
- Alert rows: white card, **1.5px left gradient rail** (red / amber / slate), icon in rounded-xl wash, priority chip, chevron.

### B. List pages (Jobs, Quality, …)

Order of chrome:

1. Header (hamburger + title)
2. Optional full-width primary (`+ New …`) — black `rounded-2xl` `min-h-tap` `font-extrabold`
3. Search field (icon left, `h-11`, `rounded-2xl`, **no border**, fill `#f0f3f7`)
4. Segmented tabs (`Active` / `All`) as **pills** + Filters button
5. Optional stats (3-up or collapsible)
6. Card list

**Filter pills:** selected = `bg-slate-900 text-white` (dark inverted). Unselected = `bg-[#f0f3f7] text-slate-500`.

**Filters button:** show a blue-600 count badge when filters ≠ default.

**Stats:** white `rounded-2xl` cells, huge `font-black` number, small label. Color the number (orange in-progress, emerald complete, red critical, amber overdue). Collapse secondary stats by default if they steal the first viewport.

**List card anatomy:**

```
JO#12345          [HIGH] [STATUS PILL]
Part number
Customer name
[ Qty 10 EA ]  [ Due 30 Aug 2026 ]
────────────────────────
[==== progress bars ====]
                    4 steps
```

- Whole card is a `Link`.
- ID left, status pill right.
- Qty/due as grey `rounded-xl` chips (`bg-[#f1f5f9]`).
- Progress: segmented `h-2` bars, emerald completed / orange remaining.

### C. Detail pages

- Back is a circular button (`navigate(-1)` or list route), not a text-only link as the only control.
- Summary card: black “JOB” micro-pill, black qty tile (`font-mono`), 3-up PART / TARGET / REMAINING cells (`bg-slate-50`, `rounded-xl`, `0.55rem` uppercase labels).
- Warnings (e.g. short material): `rounded-2xl` red-50 banner, uppercase strong label.
- Primary actions: **full-width, min-h-tap, rounded-2xl, font-extrabold text-base**.
  - Positive / Start: `#00a86b`
  - Pause / secondary: `#f1f5f9`
  - Complete / primary invert: black (white in dark)

### D. Forms

- Group fields in `.card` sections.
- Section titles: `text-xs font-extrabold uppercase tracking-widest text-slate-400`.
- Two columns on phone only for short pairs (part no / part name).
- Sticky or always-reachable Save on create flows.
- Photo capture: `capture="environment"` when using camera.

### E. Bottom sheets (filters, scanner, confirms)

```
fixed inset-0 z-50 flex flex-col justify-end
  backdrop: bg-black/40 backdrop-blur-sm
  sheet: max-w-[600px] mx-auto rounded-t-3xl bg-white px-5 pt-5
         pb-[max(1.5rem,env(safe-area-inset-bottom))]
  handle: mx-auto mb-5 h-1 w-10 rounded-full bg-slate-300
```

- Title `text-lg font-extrabold`.
- Close: 36px circle `bg-slate-100`.
- Filter groups: uppercase `text-xs tracking-widest` label + wrap of `rounded-full px-3.5 py-1.5 text-xs font-bold` chips.
- Footer: two equal buttons — **Clear** (outlined) + **Apply** (slate-900). Both `rounded-2xl py-3 font-bold`.
- Tall sheets: `max-h-[80dvh]` or `85dvh` + `overflow-y-auto`.

### F. Login

- Full viewport `100dvh` / `100svh`, `user-select: none`.
- Fluid CSS variables (`clamp`) — no device-specific breakpoint design except widening max-width and a landscape two-column grid on short landscape phones.
- Structure: brand + headline + chips → glass form card → footer.
- Login **never** follows app dark mode (`useForceLightTheme`).
- Copy scoped CSS from Shop Floor `LoginPage.css` if you want pixel match; it is intentionally not Tailwind.

---

## 9. Icons and motion

- **Inline SVG only** (22px tabs, 20px drawer, 18px search/filter).
- Stroke 2–2.5, `strokeLinecap="round"` `strokeLinejoin="round"`.
- No Material Icons / Font Awesome.

Motion:

- Drawer: `duration-300 ease-out` translate.
- Cards: `active:scale-[0.98]`.
- Skeletons: `animate-pulse` grey bars matching card shape.
- Alert count: tiny pulsing white dot on red pill.
- Respect later: `prefers-reduced-motion` if you add more scale animations.

---

## 10. Formats (copy these conventions)

### Dates

Use locale formatting, not raw ISO strings in the UI:

```ts
date.toLocaleDateString(undefined, {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
// e.g. 30 Aug 2026
```

Empty → em dash `—`.

### Identifiers

- Job numbers display as **`JO#` + number** (strip existing `JO#` / `#` then re-prefix). Empty → `JO#—`.
- NCR numbers: API `ncrNumber` or fallback `NCR#{id}`.
- Status / severity / category: **UPPERCASE pills** in lists; humanize snake_case for body copy (`Material_Defect` → `Material Defect`).

### Empty / loading / error

- Loading: pulse skeletons that mimic the real card, not a spinner-only page.
- Error: `rounded-2xl border-red-200 bg-red-50` + **Retry** as `text-xs font-extrabold underline`.
- Empty: centered `font-bold text-slate-500`, or a dashed `rounded-2xl` well. Success-empty (no alerts) may use emerald wash + check icon.

### Copy tone

- Short operator language (“Quick scan”, “Jump straight to the step timer”).
- Buttons: verb-first — Sign in, Apply, Clear, Start, Pause, Complete, Logout.
- Disabled: `opacity-60` / `opacity-50`, `cursor-not-allowed`.

---

## 11. Dark mode implementation notes

1. Inline boot script in `index.html` (before paint) reads localStorage and sets `html.dark` + `data-theme` + `colorScheme` to avoid a flash.
2. `ThemeProvider` applies the class and stores preference.
3. Login mounts `useForceLightTheme()` so the login navy screen is never inverted.
4. Inputs/selects: `color-scheme: dark` on `html.dark` so native pickers match.
5. Theme toggle lives in the **drawer**, not the header.

Change the storage key per app (`your-app-theme`) so two PWAs on the same origin (or shared localStorage in dev) do not clash.

---

## 12. PWA chrome

`index.html` viewport:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="theme-color" content="#1e293b" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
```

Manifest (vite-plugin-pwa):

| Field | Shop Floor value | Rule for the new app |
|--------|------------------|----------------------|
| `theme_color` | `#1e293b` | Keep unless brand changes |
| `background_color` | `#f4f6f9` | Match canvas |
| `display` | `standalone` | Required |
| `orientation` | `portrait` | Prefer portrait for operator apps |
| Icons | 192 + 512 PNG, plus maskable 512 | Provide both |

Workbox: cache `js,css,html,ico,png,svg,woff2`; `navigateFallback: /index.html`.

---

## 13. Folder conventions (optional but matching)

```
src/
  index.css              # Tailwind + component classes + dark contrast boost
  theme/ThemeContext.tsx
  components/
    AppShell.tsx
    BottomTabs.tsx
    NavDrawer.tsx
  pages/                 # one file per screen; colocated *.css only for login
  nav.ts                 # BOTTOM_TABS + DRAWER_LINKS
```

Keep business CSS in Tailwind. The only large custom stylesheet in Shop Floor is **login**.

---

## 14. Do / don’t

**Do**

- Design 375px first; cap content at 600px.
- Use cards + pills + bottom sheets.
- Use black primary buttons in light mode; invert in dark.
- Use Source Sans 3, slate canvas, blue accent, emerald success, red danger.
- Honor safe-area insets on header, tabs, sheets, login.
- Match date and ID formats above.

**Don’t**

- Port Cimmple_UI MasterListPage, sidebars, or slideouts.
- Use dense HTML tables on the floor.
- Put primary destinations only in the drawer (tabs are primary).
- Use tap targets under 44–48px.
- Restyle login with the authenticated light card language (login stays navy).
- Introduce a third persistent bar (header + sticky actions + tabs) without measuring content height on ~667–844px phones.

---

## Appendix A — Copy-paste `tailwind.config.js`

```js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#1e293b", muted: "#334155" },
        accent: { DEFAULT: "#2563eb", soft: "#eff6ff" },
        surface: { DEFAULT: "#ffffff", dark: "#1e293b" },
        canvas: { DEFAULT: "#f4f6f9", dark: "#020617" },
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.06)",
        "card-dark": "0 2px 8px rgba(0, 0, 0, 0.35), 0 8px 24px rgba(0, 0, 0, 0.25)",
      },
      minHeight: { tap: "48px" },
      fontFamily: {
        sans: ['"Source Sans 3"', "Segoe UI", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
```

`postcss.config.js`:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

---

## Appendix B — Copy-paste `src/index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html,
  body,
  #root {
    @apply m-0 min-h-full;
  }

  body {
    @apply min-w-[320px] bg-[#f4f6f9] font-sans text-slate-900 antialiased;
    background-image: linear-gradient(180deg, #eef2f7 0%, #f4f6f9 28%, #f4f6f9 100%);
  }

  html.dark body {
    @apply bg-slate-950 text-slate-100;
    background-image: none;
    color-scheme: dark;
  }

  html.dark input,
  html.dark select,
  html.dark textarea {
    color-scheme: dark;
  }
}

@layer components {
  .btn {
    @apply inline-flex min-h-tap items-center justify-center rounded-full border border-transparent px-5 font-bold transition disabled:cursor-not-allowed disabled:opacity-60;
  }

  .btn-primary {
    @apply bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200;
  }

  .btn-secondary {
    @apply border-slate-300 bg-white text-slate-900 hover:bg-slate-50 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700;
  }

  .btn-success {
    @apply bg-emerald-500 text-white hover:bg-emerald-600 dark:bg-emerald-500 dark:hover:bg-emerald-400;
  }

  .btn-ghost {
    @apply min-h-tap border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700;
  }

  .btn-danger {
    @apply border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-950/70;
  }

  .field {
    @apply flex flex-col gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200;
  }

  .field-input {
    @apply min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-base font-normal text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-400 dark:focus:border-blue-400 dark:focus:ring-blue-900/50;
  }

  .card {
    @apply rounded-3xl border border-transparent bg-white shadow-[0_4px_24px_rgba(0,0,0,0.04)] dark:border-slate-700 dark:bg-slate-800 dark:shadow-[0_4px_24px_rgba(0,0,0,0.35)];
  }

  .badge {
    @apply inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-[0.7rem] font-extrabold uppercase tracking-widest;
  }

  .badge-active {
    @apply bg-blue-100/50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300;
  }

  .badge-done {
    @apply bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300;
  }

  .badge-idle {
    @apply bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-200;
  }

  .badge-warn {
    @apply bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-300;
  }

  .badge-critical {
    @apply bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300;
  }
}

html.dark .text-slate-400 {
  color: #cbd5e1;
}
html.dark .text-slate-500 {
  color: #cbd5e1;
}
html.dark .bg-slate-50,
html.dark .bg-slate-50\/80 {
  background-color: rgb(30 41 59 / 0.7);
}
html.dark .divide-slate-100 > :not([hidden]) ~ :not([hidden]) {
  border-color: #334155;
}
```

---

## Appendix C — Theme boot script (`index.html` `<head>`)

Replace the storage key with your app’s key.

```html
<script>
  (function () {
    try {
      var t = localStorage.getItem("cimmple-pwa-theme");
      if (t !== "dark" && t !== "light") t = "light";
      var root = document.documentElement;
      if (t === "dark") {
        root.classList.add("dark");
        root.setAttribute("data-theme", "dark");
      } else {
        root.classList.remove("dark");
        root.setAttribute("data-theme", "light");
      }
      root.style.colorScheme = t;
    } catch (e) {}
  })();
</script>
```

---

## Appendix D — Quick visual checklist

- [ ] Canvas is cool grey (`#f4f6f9`), not pure white or ERP navy (except login).
- [ ] Content column ≤ 600px, padded 16px.
- [ ] Tab bar 68px + home-indicator inset; main has matching bottom padding.
- [ ] Titles extra-bold/black; IDs prominent; meta uppercase and small.
- [ ] Primary = black pill/bar; success = emerald; danger = red wash.
- [ ] Cards `rounded-3xl`, soft shadow, full-card tap.
- [ ] Filters and confirms are bottom sheets with a grab handle.
- [ ] Search is borderless grey pill with left magnifier.
- [ ] Dark mode is class-based, persisted, and skipped on login.
- [ ] Dates look like `30 Aug 2026`; jobs like `JO#123`.
- [ ] Verified on a real phone (~375px), not only desktop DevTools.

---

**Source:** extracted from `Cimmple_PWA/` (Tailwind theme, `src/index.css`, `AppShell`, `BottomTabs`, `NavDrawer`, list/detail/form pages, login CSS, Vite PWA manifest). Update this file if Shop Floor design tokens change.
