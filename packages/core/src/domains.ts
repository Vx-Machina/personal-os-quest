/** The nine life domains (wheel of life). Every task is tagged with exactly one. */
export const DOMAINS = [
  'health',
  'family',
  'social',
  'love',
  'career',
  'finance',
  'fun',
  'growth',
  'environment',
] as const;

export type Domain = (typeof DOMAINS)[number];

export interface DomainInfo {
  label: string;
  /** Short label for tight spaces (radar axes, Discord). */
  short: string;
  color: string;
  /** Sprite id in the icon sheet. */
  icon: string;
}

export const DOMAIN_INFO: Record<Domain, DomainInfo> = {
  health: { label: 'Health', short: 'Health', color: '#ff6b6b', icon: 'dom-health' },
  family: { label: 'Family', short: 'Family', color: '#ffa94d', icon: 'dom-family' },
  social: { label: 'Social', short: 'Social', color: '#ffd43b', icon: 'dom-social' },
  love: { label: 'Love', short: 'Love', color: '#f783ac', icon: 'dom-love' },
  career: { label: 'Career', short: 'Career', color: '#4dabf7', icon: 'dom-career' },
  finance: { label: 'Finance', short: 'Finance', color: '#69db7c', icon: 'dom-finance' },
  fun: { label: 'Fun', short: 'Fun', color: '#da77f2', icon: 'dom-fun' },
  growth: { label: 'Personal Development', short: 'Growth', color: '#9775fa', icon: 'dom-growth' },
  environment: { label: 'Environment', short: 'Environ.', color: '#38d9a9', icon: 'dom-environment' },
};

export function isDomain(value: unknown): value is Domain {
  return typeof value === 'string' && (DOMAINS as readonly string[]).includes(value);
}

export function emptyStats(): Record<Domain, number> {
  return Object.fromEntries(DOMAINS.map((d) => [d, 0])) as Record<Domain, number>;
}

/** Accepts ids ("growth"), labels ("Personal Development") or short labels, case-insensitive. */
export function parseDomain(input: string): Domain | null {
  const q = input.trim().toLowerCase();
  for (const d of DOMAINS) {
    const info = DOMAIN_INFO[d];
    if (q === d || q === info.label.toLowerCase() || q === info.short.toLowerCase().replace('.', '')) return d;
  }
  if (q === 'personal development' || q === 'pd' || q === 'personal') return 'growth';
  return null;
}
