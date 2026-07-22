import { describe, expect, it } from 'vitest';
import { computeJobCost, DEFAULT_PRICING } from './pricing';
import { MAX_DURATION_SEC, MIN_DURATION_SEC } from './params';

describe('computeJobCost', () => {
  it('is base + perSecond * duration with defaults', () => {
    // 10 + 4*5 = 30
    expect(computeJobCost({ durationSec: 5 })).toBe(30);
  });

  it('honors custom pricing config', () => {
    const pricing = { baseCredits: 5, perSecondCredits: 2 };
    expect(computeJobCost({ durationSec: 4 }, pricing)).toBe(13);
  });

  it('rounds up fractional durations', () => {
    expect(computeJobCost({ durationSec: 2.5 }, { baseCredits: 0, perSecondCredits: 3 })).toBe(8);
  });

  it('is monotonic in duration', () => {
    let prev = -1;
    for (let d = MIN_DURATION_SEC; d <= MAX_DURATION_SEC; d++) {
      const cost = computeJobCost({ durationSec: d });
      expect(cost).toBeGreaterThan(prev);
      prev = cost;
    }
  });

  it('never returns negative', () => {
    expect(computeJobCost({ durationSec: 0 }, { baseCredits: 0, perSecondCredits: 0 })).toBe(0);
  });

  it('default pricing matches the seeded config shape', () => {
    expect(DEFAULT_PRICING).toEqual({ baseCredits: 10, perSecondCredits: 4 });
  });
});
