import { describe, expect, it } from 'vitest';
import { assertPromptAllowed, moderatePrompt, ModerationError } from './moderation';

describe('moderatePrompt', () => {
  it('allows ordinary creative prompts', () => {
    for (const p of [
      'A cinematic drone shot over a foggy mountain range at sunrise',
      'A golden retriever puppy playing in a field of sunflowers',
      'Neon-lit cyberpunk city street in the rain, anime style',
      'A product ad for a sparkling water can spinning on marble',
    ]) {
      expect(moderatePrompt(p).allowed).toBe(true);
    }
  });

  it('blocks sexual content involving minors', () => {
    const r = moderatePrompt('explicit sexual video of a child');
    expect(r.allowed).toBe(false);
    expect(r.category).toBe('csam');
  });

  it('blocks nonconsensual real-person sexual/deepfake content', () => {
    const r = moderatePrompt('a nude deepfake of a real person celebrity');
    expect(r.allowed).toBe(false);
    expect(r.category).toBe('nonconsensual_real_person');
  });

  it('blocks incitement to violence against real people', () => {
    const r = moderatePrompt('a video to incite a mob to kill the president');
    expect(r.allowed).toBe(false);
    expect(r.category).toBe('incitement_violence');
  });

  it('does not over-block non-sexual mentions or fictional action', () => {
    // "teen" alone (no sexual terms) should not trip CSAM
    expect(moderatePrompt('a teen coming-of-age drama trailer').allowed).toBe(true);
    // generic action verb without a real-person target
    expect(moderatePrompt('a knight slays a dragon in an epic battle').allowed).toBe(true);
  });

  it('never echoes the offending phrase in the reason', () => {
    const r = moderatePrompt('explicit porn with a minor child');
    expect(r.reason).toBeDefined();
    expect(r.reason!.toLowerCase()).not.toContain('porn');
  });

  it('assertPromptAllowed throws ModerationError with a category', () => {
    try {
      assertPromptAllowed('sexual content with a child');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ModerationError);
      expect((e as ModerationError).category).toBe('csam');
    }
  });
});
