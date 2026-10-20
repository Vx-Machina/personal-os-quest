import { DOMAINS, DOMAIN_INFO, type Domain } from './domains';

/** Text progress bar for chat front ends: bar(30, 50, 10) -> "██████░░░░". */
export function bar(value: number, max: number, width = 10): string {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const filled = Math.round(ratio * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/** Domain stats sorted in wheel order with a bar relative to the strongest stat. */
export function statLines(stats: Record<Domain, number>, width = 10): string[] {
  const max = Math.max(10, ...DOMAINS.map((d) => stats[d] ?? 0));
  const labelWidth = Math.max(...DOMAINS.map((d) => DOMAIN_INFO[d].short.length));
  return DOMAINS.map((d) => `${DOMAIN_INFO[d].short.padEnd(labelWidth)} ${bar(stats[d] ?? 0, max, width)} ${stats[d] ?? 0}`);
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
