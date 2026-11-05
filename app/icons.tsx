function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
      {children}
    </svg>
  );
}

export const BagIcon = () => (
  <Icon>
    <path d="M5 8h14l-1.2 12H6.2L5 8Z" />
    <path d="M9 8a3 3 0 0 1 6 0" />
  </Icon>
);
export const SunIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);
export const MoonIcon = () => (
  <Icon>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
  </Icon>
);
export const SystemIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </Icon>
);
export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const MinusIcon = () => (
  <Icon>
    <path d="M5 12h14" />
  </Icon>
);
export const UserIcon = () => (
  <Icon>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20a8 8 0 0 1 16 0" />
  </Icon>
);
export const SearchIcon = () => (
  <Icon>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
  </Icon>
);
export const TrendIcon = () => (
  <Icon>
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </Icon>
);
export const MenuIcon = () => (
  <Icon>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);
export const CloseIcon = () => (
  <Icon>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);
export const ChevronUpIcon = () => (
  <Icon>
    <path d="m6 15 6-6 6 6" />
  </Icon>
);
export const TruckIcon = () => (
  <Icon>
    <path d="M2 5h12v10H2zM14 9h4l3 3v3h-7" />
    <circle cx="6" cy="17" r="2" />
    <circle cx="17" cy="17" r="2" />
  </Icon>
);
export const CashIcon = () => (
  <Icon>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 12h.01M18 12h.01" />
  </Icon>
);
export const CardIcon = () => (
  <Icon>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M2 10h20M6 15h4" />
  </Icon>
);
export const InstagramIcon = () => (
  <Icon>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <path d="M17.5 6.5h.01" />
  </Icon>
);
export const TelegramIcon = () => (
  <Icon>
    <path d="M21 4 3 11l6 2 2 6 3-4 5 4 2-15ZM9 13l12-9" />
  </Icon>
);
export const TrashIcon = () => (
  <Icon>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Icon>
);
export const GridIcon = () => (
  <Icon>
    <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
  </Icon>
);
export const TshirtIcon = () => (
  <Icon>
    <path d="M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0Z" />
  </Icon>
);
export const ShirtIcon = () => (
  <Icon>
    <path d="M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3M8 3l4 4 4-4M12 7v14" />
  </Icon>
);
export const PantsIcon = () => (
  <Icon>
    <path d="M6 3h12l1 18h-5l-2-11-2 11H5L6 3ZM6 7h12" />
  </Icon>
);
export const HoodieIcon = () => (
  <Icon>
    <path d="M8 4C6 5 4 6.5 4 9v11h3v-9M16 4c2 1 4 2.5 4 5v11h-3v-9M7 11v10h10V11M8 4a4 4 0 0 0 8 0M9 17h6" />
  </Icon>
);
export const ShoeIcon = () => (
  <Icon>
    <path d="M3 7v10h18v-1a3 3 0 0 0-3-3l-6-1.5L8 8 3 7ZM9 11l1.5-1.5M11.5 12.5 13 11" />
  </Icon>
);
export const JacketIcon = () => (
  <Icon>
    <path d="M9 3 4 6v15h16V6l-5-3M9 3l3 3 3-3M12 6v15M7 14h2M15 14h2" />
  </Icon>
);
export const SweaterIcon = () => (
  <Icon>
    <path d="M8 4 4 7v12h3v-9M16 4l4 3v12h-3v-9M7 10v10h10V10M8 4a4 2 0 0 0 8 0M7 17h10" />
  </Icon>
);
export const GlassesIcon = () => (
  <Icon>
    <circle cx="6.5" cy="14" r="3.5" />
    <circle cx="17.5" cy="14" r="3.5" />
    <path d="M10 14h4M3 14l1-6M21 14l-1-6" />
  </Icon>
);
/** Dropdown arrow of the combobox and the styled <select>. */
export const ChevronDownIcon = ({ className }: { className?: string }) => (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={className}>
    <path d="M5.2 7.2a.75.75 0 0 1 1.06 0L10 10.94l3.74-3.74a.75.75 0 1 1 1.06 1.06l-4.27 4.27a.75.75 0 0 1-1.06 0L5.2 8.26a.75.75 0 0 1 0-1.06Z" />
  </svg>
);
/** Hand-drawn style shopping bag with a check, in the same sticker look as the old tik.png check mark. */
export const BagCheckArt = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" fill="none" stroke="var(--brand-ink)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <g transform="rotate(-8 50 55)">
      <path d="M36 36v-7a14 14 0 0 1 28 0v7" />
      <path d="M20 36h60l-5 50a6 6 0 0 1-6 5H31a6 6 0 0 1-6-5Z" fill="var(--brand)" />
      <path d="m37 63 9 9 18-19" strokeWidth={7} />
    </g>
  </svg>
);
/** Crossed-out wifi in the same sticker look, for the no-connection screen (public/offline.html has a copy). */
export const WifiOffArt = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" fill="none" stroke="var(--brand-ink)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <circle cx="50" cy="52" r="40" fill="var(--brand)" />
    <path d="M27 46a33 33 0 0 1 46 0M35 55a21 21 0 0 1 30 0M43 64a9 9 0 0 1 14 0" />
    <path d="M50 74h.01" strokeWidth={9} />
    <path d="m26 28 48 48" strokeWidth={7} />
  </svg>
);
/** The same bag with a question mark, for the 404 page. */
export const BagQuestionArt = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" fill="none" stroke="var(--brand-ink)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <g transform="rotate(8 50 55)">
      <path d="M36 36v-7a14 14 0 0 1 28 0v7" />
      <path d="M20 36h60l-5 50a6 6 0 0 1-6 5H31a6 6 0 0 1-6-5Z" fill="var(--brand)" />
      <path d="M42 55a8 8 0 1 1 11 7.4c-2 .9-3 2.6-3 4.6v2" strokeWidth={7} />
      <path d="M50 79h.01" strokeWidth={9} />
    </g>
  </svg>
);
