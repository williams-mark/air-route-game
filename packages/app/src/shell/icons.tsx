import type { ReactNode } from "react";

function Svg({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}
type P = { size?: number };

export const IconMap = (p: P) => <Svg {...p}><path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" /><path d="M9 4v14M15 6v14" /></Svg>;
export const IconRoutes = (p: P) => <Svg {...p}><circle cx="5.5" cy="17.5" r="2" /><circle cx="18.5" cy="6.5" r="2" /><path d="M7.4 16.6c4-1 2-6.2 5.6-7.4 1.2-.4 2.6-.6 3.6-1.1" /></Svg>;
export const IconFleet = (p: P) => <Svg {...p}><path d="M21 15.5 13.5 11V5.5a1.5 1.5 0 0 0-3 0V11L3 15.5V18l7.5-2v3L8.5 20.5V22l3.5-.8 3.5.8v-1.5L13.5 19v-3L21 18v-2.5Z" /></Svg>;
export const IconPlanner = (p: P) => <Svg {...p}><path d="M3 6h9M3 12h14M3 18h7" strokeWidth="2.6" /><path d="M15 6h6M12 18h9" strokeWidth="2.6" opacity=".55" /></Svg>;
export const IconOrders = (p: P) => <Svg {...p}><path d="M4 7h16v12H4z" /><path d="M8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M4 12h16" /></Svg>;
export const IconFinance = (p: P) => <Svg {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Svg>;
export const IconSettings = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" /></Svg>;
export const IconPause = (p: P) => <Svg {...p}><path d="M8 5v14M16 5v14" strokeWidth="2.6" /></Svg>;
export const IconPlay = (p: P) => <Svg {...p}><path d="M7 4.5v15l12-7.5-12-7.5Z" fill="currentColor" /></Svg>;
export const IconSun = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>;
export const IconMoon = (p: P) => <Svg {...p}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" /></Svg>;
export const IconSearch = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></Svg>;
export const IconKeyboard = (p: P) => <Svg {...p}><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></Svg>;
export const IconChevron = (p: P) => <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>;
export const IconInfo = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Svg>;
export const IconGood = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="m8 12.5 3 3 5-6" /></Svg>;
export const IconWarn = (p: P) => <Svg {...p}><path d="M12 3.5 2.5 20h19L12 3.5Z" /><path d="M12 10v5M12 17.5h.01" /></Svg>;
export const IconAlert = (p: P) => <Svg {...p}><path d="M8 3h8l5 5v8l-5 5H8l-5-5V8l5-5Z" /><path d="M12 8v5M12 16h.01" /></Svg>;
export const IconBell = (p: P) => <Svg {...p}><path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15L6 17ZM10 21h4" /></Svg>;
export const IconTag = (p: P) => <Svg {...p}><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.6 6.6a1.5 1.5 0 0 1-2.1 0L3.5 12.2Z" /><path d="M8 8h.01" /></Svg>;
export const IconCabin = (p: P) => <Svg {...p}><path d="M2.5 12c0-2 1.5-3.5 3.5-3.5h12c2.2 0 3.5 1.5 3.5 3.5s-1.3 3.5-3.5 3.5H6c-2 0-3.500-1.500-3.500-3.500Z" /><path d="M8 10v4M11 10v4M14 10v4M17 10v4" /></Svg>;
export const IconRivals = (p: P) => <Svg {...p}><circle cx="9" cy="8" r="3" /><path d="M3.5 19c0-3.2 2.4-5 5.5-5s5.500 1.800 5.500 5" /><circle cx="17.5" cy="9" r="2.300" /><path d="M16.500 14.200c2.700-.2 4.500 1.300 4.500 4" /></Svg>;
export const IconHubBoard = (p: P) => <Svg {...p}><path d="M3 5h18v14H3z" /><path d="M3 10h18M8 5v14" /><path d="M11 13.500h7M11 16.500h5" /></Svg>;
export const IconHubs = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="2.500" /><circle cx="5" cy="6" r="1.500" /><circle cx="19" cy="6" r="1.500" /><circle cx="5" cy="18" r="1.500" /><circle cx="19" cy="18" r="1.500" /><path d="M6.200 7l4 3.600M17.800 7l-4 3.600M6.200 17l4-3.600M17.800 17l-4-3.600" /></Svg>;
export const IconFarePolicy = (p: P) => <Svg {...p}><path d="M4 5h9l7 7-8 8-8-8z" /><circle cx="9" cy="9.500" r="1.200" /><path d="M10 15l4-4" /></Svg>;
