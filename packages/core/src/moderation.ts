// The single, reviewable prompt-moderation module. Dispatch is blocked for clearly
// prohibited content. This is deliberately conservative pattern matching, not a model:
// it is the last line before spending money on a provider, and it is meant to be easy
// to audit and extend. Categories (per project safety spec):
//   - sexual content involving minors
//   - targeted real-person sexual/deepfake content
//   - incitement to violence
//
// Keep the logic here and only here. Every rule carries a category for audit logs.

export interface ModerationResult {
  allowed: boolean;
  category?: string;
  reason?: string;
}

export class ModerationError extends Error {
  readonly category: string;
  constructor(category: string, reason: string) {
    super(reason);
    this.name = 'ModerationError';
    this.category = category;
  }
}

const MINOR_TERMS =
  /\b(child|children|kid|kids|minor|minors|underage|preteen|pre-teen|teen|teenage|toddler|infant|baby|babies|schoolgirl|schoolboy|loli|shota|(\d|1[0-7])\s*(?:yo|y\/o|years?\s*old))\b/i;

const SEXUAL_TERMS =
  /\b(sex|sexual|sexually|nude|nudes|nudity|naked|porn|pornographic|explicit|nsfw|erotic|erotica|xxx|genital|genitalia|penis|vagina|breasts?|nipples?|masturbat\w*|intercourse|fellatio|cunnilingus|orgasm|hentai|fetish|bdsm)\b/i;

const VIOLENCE_INCITEMENT =
  /\b(kill|murder|assassinate|slaughter|massacre|bomb|shoot|behead|lynch|exterminate|genocide)\b/i;

const REALPERSON_HINTS =
  /\b(deepfake|deep-fake|face[- ]?swap|as (?:president|senator|governor)|celebrity|real person|actual person|nonconsensual|non-consensual|revenge porn)\b/i;

const TARGETED_VIOLENCE =
  /\b(kill|murder|assassinate|behead|lynch|shoot|bomb)\b[^.!?]{0,40}\b(president|senator|governor|mayor|minister|official|politician|ceo|journalist|[A-Z][a-z]+\s+[A-Z][a-z]+)\b/;

/**
 * Returns an allow/deny decision. Denials include a stable category for audit logging
 * and a user-safe reason (never echoes the offending phrase).
 */
export function moderatePrompt(prompt: string): ModerationResult {
  const text = prompt.normalize('NFKC');

  if (MINOR_TERMS.test(text) && SEXUAL_TERMS.test(text)) {
    return {
      allowed: false,
      category: 'csam',
      reason: 'This request appears to involve sexual content with minors and cannot be processed.',
    };
  }

  if (SEXUAL_TERMS.test(text) && REALPERSON_HINTS.test(text)) {
    return {
      allowed: false,
      category: 'nonconsensual_real_person',
      reason: 'This request appears to target a real person with explicit or deepfake content and cannot be processed.',
    };
  }

  if (VIOLENCE_INCITEMENT.test(text) && (REALPERSON_HINTS.test(text) || TARGETED_VIOLENCE.test(text))) {
    return {
      allowed: false,
      category: 'incitement_violence',
      reason: 'This request appears to incite violence against a real person or group and cannot be processed.',
    };
  }

  return { allowed: true };
}

/** Throws ModerationError when the prompt is disallowed; otherwise returns. */
export function assertPromptAllowed(prompt: string): void {
  const result = moderatePrompt(prompt);
  if (!result.allowed) {
    throw new ModerationError(result.category ?? 'blocked', result.reason ?? 'Prompt not allowed.');
  }
}
