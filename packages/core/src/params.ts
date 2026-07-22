// Shared generation-parameter schema. Used by the web submit route (validation),
// the cost preview, and the worker. One definition, zod-enforced everywhere.
import { z } from 'zod';

export const ASPECT_RATIOS = ['16:9', '9:16', '1:1'] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const STYLE_PRESETS = ['cinematic', 'realistic', 'anime', 'claymation', 'retro'] as const;
export type StylePreset = (typeof STYLE_PRESETS)[number];

export const MIN_DURATION_SEC = 2;
export const MAX_DURATION_SEC = 10;

export const ASPECT_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  '16:9': { width: 1280, height: 720 },
  '9:16': { width: 720, height: 1280 },
  '1:1': { width: 1024, height: 1024 },
};

export const MAX_PROMPT_LENGTH = 2000;

export const jobParamsSchema = z.object({
  durationSec: z.coerce.number().int().min(MIN_DURATION_SEC).max(MAX_DURATION_SEC),
  aspectRatio: z.enum(ASPECT_RATIOS),
  stylePreset: z.enum(STYLE_PRESETS),
  referenceImageKey: z.string().min(1).max(512).optional(),
});
export type JobParams = z.infer<typeof jobParamsSchema>;

export const generateRequestSchema = z.object({
  prompt: z.string().trim().min(1, 'Prompt is required').max(MAX_PROMPT_LENGTH),
  durationSec: z.coerce.number().int().min(MIN_DURATION_SEC).max(MAX_DURATION_SEC),
  aspectRatio: z.enum(ASPECT_RATIOS),
  stylePreset: z.enum(STYLE_PRESETS),
  referenceImageKey: z.string().min(1).max(512).optional(),
});
export type GenerateRequest = z.infer<typeof generateRequestSchema>;

/** Serialize the stored params blob (Job.paramsJson) — D3: JSON lives in a String column. */
export function serializeJobParams(params: JobParams): string {
  return JSON.stringify(params);
}

export function parseJobParams(json: string): JobParams {
  return jobParamsSchema.parse(JSON.parse(json));
}
