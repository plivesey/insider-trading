// Art-deco theme system for the 1920s "Trading Floor" reskin.
// Single source of truth for the palette, fonts, and the data-color → industry mapping.
//
// The backend data model uses Color = 'Blue' | 'Orange' | 'Yellow' | 'Purple'. The
// UI displays them as Steel / Oil / Rail / Bank. Mapping happens here so backend
// types never need to change.

import type { Color, StockColor } from '@insider-trading/shared';

export const C = {
  felt: '#0d2a23',
  felt2: '#143a31',
  felt3: '#1c4b3f',
  brass: '#c9a35a',
  brass2: '#a88547',
  brass3: '#7c6334',
  ivory: '#efe5d0',
  ivory2: '#c8b78b',
  ivoryD: '#9e8a5c',
  ink: '#0a0805',
  paper: '#f0e6cf',
  rail: '#52a173',
  steel: '#5a8cc4',
  oil: '#d59a3c',
  bank: '#8a6243',
  red: '#d65454',
  green: '#6fbb88',
  wild: '#c8b78b'
};

export interface IndustryMeta {
  key: 'Steel' | 'Oil' | 'Rail' | 'Bank' | 'Wild';
  label: string;
  long: string;
  icon: 'rail' | 'steel' | 'oil' | 'bank';
  accent: string;
  mono: string;
}

export const INDUSTRY: Record<StockColor, IndustryMeta> = {
  Blue:   { key: 'Steel', label: 'Steel',      long: 'Bethlehem Steel Co.', icon: 'steel', accent: C.steel, mono: 'S' },
  Orange: { key: 'Oil',   label: 'Oil',        long: 'Standard Oil & Co.',  icon: 'oil',   accent: C.oil,   mono: 'O' },
  Yellow: { key: 'Rail',  label: 'Rail',       long: 'Continental Rail',    icon: 'rail',  accent: C.rail,  mono: 'R' },
  Purple: { key: 'Bank',  label: 'Bank',       long: 'Consolidated Trust Co.', icon: 'bank', accent: C.bank,  mono: 'B' },
  Wild:   { key: 'Wild',  label: 'Wild',       long: 'Wild Share',          icon: 'rail',  accent: C.wild,  mono: '★' }
};

// Ordered list for the ticker / dropdowns. Steel · Oil · Rail · Bank.
export const INDUSTRY_ORDER: Color[] = ['Blue', 'Orange', 'Yellow', 'Purple'];

export const FONT_DISPLAY = "'Limelight', 'Cinzel', serif";
export const FONT_DECO    = "'Cinzel', 'Limelight', serif";
export const FONT_BODY    = "'Karla', 'Inter', system-ui, sans-serif";
export const FONT_NUM     = "'Bodoni Moda', 'Playfair Display', serif";

/**
 * Replace data color names ("Blue", "Orange", …) with industry labels ("Steel",
 * "Oil", …) inside a free-form string. Used for goal text / log messages that
 * the backend hands us as English referencing the underlying color names.
 */
export function relabelColors(text: string): string {
  return text
    .replace(/\bBlue\b/g, INDUSTRY.Blue.label)
    .replace(/\bOrange\b/g, INDUSTRY.Orange.label)
    .replace(/\bYellow\b/g, INDUSTRY.Yellow.label)
    .replace(/\bPurple\b/g, INDUSTRY.Purple.label);
}

export function industryClass(color: StockColor): string {
  return `ind-${color.toLowerCase()}`;
}

// =================================================================
//  SVG primitives (inlined so they can size/color freely)
// =================================================================

type IconProps = { size?: number; color?: string; stroke?: number };

const RailIcon = ({ size = 24, color = 'currentColor', stroke = 1.6 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
       strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="3" width="14" height="13" rx="2.5" />
    <line x1="5" y1="9" x2="19" y2="9" />
    <circle cx="9" cy="13" r="1.2" fill={color} stroke="none" />
    <circle cx="15" cy="13" r="1.2" fill={color} stroke="none" />
    <line x1="8" y1="16" x2="6" y2="20" />
    <line x1="16" y1="16" x2="18" y2="20" />
    <line x1="3" y1="20" x2="21" y2="20" />
  </svg>
);

const SteelIcon = ({ size = 24, color = 'currentColor', stroke = 1.6 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
       strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20 L12 4 L20 20 Z" />
    <path d="M4 20 L20 20" />
    <path d="M8 14 L16 14" />
    <path d="M12 4 L12 20" />
  </svg>
);

const OilIcon = ({ size = 24, color = 'currentColor', stroke = 1.6 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
       strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3 C 8 9, 6 12, 6 15 a6 6 0 0 0 12 0 c 0 -3 -2 -6 -6 -12 Z" />
    <path d="M10 14 c 0 1.5 1 2.5 2 2.5" />
  </svg>
);

const BankIcon = ({ size = 24, color = 'currentColor', stroke = 1.6 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
       strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9 L12 4 L21 9 Z" />
    <line x1="5" y1="11" x2="5" y2="17" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
    <line x1="19" y1="11" x2="19" y2="17" />
    <line x1="3" y1="20" x2="21" y2="20" />
  </svg>
);

const ICONS: Record<'rail' | 'steel' | 'oil' | 'bank', (p: IconProps) => JSX.Element> = {
  rail: RailIcon,
  steel: SteelIcon,
  oil: OilIcon,
  bank: BankIcon
};

export function IndustryIcon({
  industry,
  size = 24,
  color = 'currentColor',
  stroke = 1.6
}: {
  industry: 'rail' | 'steel' | 'oil' | 'bank';
  size?: number;
  color?: string;
  stroke?: number;
}) {
  const Icon = ICONS[industry] ?? RailIcon;
  return <Icon size={size} color={color} stroke={stroke} />;
}

export function DecoCorner({
  size = 28,
  color = 'currentColor',
  rotate = 0
}: {
  size?: number;
  color?: string;
  rotate?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke={color}
         strokeWidth="1.2" style={{ transform: `rotate(${rotate}deg)` }}>
      <path d="M2 2 L 30 2 L 30 8" />
      <path d="M2 2 L 2 30 L 8 30" />
      <path d="M6 6 L 24 6 L 24 9" />
      <path d="M6 6 L 6 24 L 9 24" />
      <circle cx="6" cy="6" r="1.4" fill={color} stroke="none" />
    </svg>
  );
}

export function DecoBadge({ size = 48 }: { size?: number } = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="22" fill="none" stroke={C.brass} strokeWidth="1" />
      <circle cx="24" cy="24" r="19" fill="none" stroke={C.brass} strokeWidth="0.6" />
      <path d="M24 6 L28 24 L24 42 L20 24 Z" fill={C.brass} opacity="0.85" />
      <path d="M6 24 L24 28 L42 24 L24 20 Z" fill={C.brass} opacity="0.85" />
      <circle cx="24" cy="24" r="3" fill={C.felt} stroke={C.brass} strokeWidth="0.8" />
    </svg>
  );
}

// =================================================================
//  Shared chrome primitives
// =================================================================

/** Brass-bordered, felt-gradient panel with Cinzel title + small subtitle. */
export function Panel({
  title,
  subtitle,
  children,
  flex = false,
  className = '',
  bodyClass = '',
  headRight
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  flex?: boolean;
  className?: string;
  bodyClass?: string;
  headRight?: React.ReactNode;
}) {
  return (
    <div className={`deco-panel${flex ? ' deco-panel--flex' : ''} ${className}`.trim()}>
      <div className="deco-panel__head">
        <div className="deco-panel__title">{title}</div>
        {subtitle && <div className="deco-panel__sub">{subtitle}</div>}
        {headRight}
      </div>
      <div className={`deco-panel__body ${bodyClass}`.trim()}>{children}</div>
    </div>
  );
}

export function BrassButton({
  label,
  primary = false,
  disabled = false,
  onClick,
  type = 'button',
  className = ''
}: {
  label: React.ReactNode;
  primary?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`brass-btn${primary ? ' brass-btn--primary' : ''} ${className}`.trim()}
    >
      {label}
    </button>
  );
}

export function Monogram({ name, accent = C.ivory2 }: { name: string; accent?: string }) {
  const initial = name === 'You' ? 'Y' : (name[0] ?? '?').toUpperCase();
  return (
    <div
      className="monogram"
      style={{ borderColor: accent, color: accent }}
    >
      {initial}
    </div>
  );
}

export function Sep() {
  return <span className="deco-sep">·</span>;
}
