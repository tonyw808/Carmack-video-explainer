import type { LedgerReason } from '@reelforge/db';

export const REASON_LABELS: Record<LedgerReason, string> = {
  purchase: 'Credit purchase',
  signup_bonus: 'Welcome bonus',
  job_reserve: 'Video generation',
  job_refund: 'Refund (failed job)',
  job_cancel_refund: 'Refund (canceled)',
  manual_refund: 'Manual refund',
  admin_adjust: 'Admin adjustment',
};

export function reasonLabel(reason: string): string {
  return REASON_LABELS[reason as LedgerReason] ?? reason;
}

export function formatCredits(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
