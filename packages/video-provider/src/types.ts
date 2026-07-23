import type { JobParams } from '@reelforge/core';

export interface ProviderJobInput {
  jobId: string;
  prompt: string;
  params: JobParams;
  /** Absolute path to a reference image on disk, if the user supplied one. */
  referenceImagePath?: string;
  /** Per-job isolated working directory the provider may write to. */
  workDir: string;
}

export interface ProviderHandle {
  /** The provider's own identifier for this job (persisted as Job.providerRef). */
  providerRef: string;
}

export interface CompletionOptions {
  /** Hard timeout for the whole generation. */
  timeoutMs: number;
  /** Abort to cancel the wait (graceful shutdown / user cancel). */
  signal?: AbortSignal;
  /** Optional progress callback (0..100). */
  onProgress?: (percent: number) => void;
}

export interface ProviderArtifacts {
  mp4Path: string;
  thumbPath: string;
  width: number;
  height: number;
  durationSec: number;
  mp4Bytes: number;
  thumbBytes: number;
}

export type ProviderErrorKind = 'failed' | 'timeout' | 'canceled';

/** All provider failures surface as this. userSafeMessage is shown to end users. */
export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly userSafeMessage: string;
  readonly retryable: boolean;
  constructor(
    kind: ProviderErrorKind,
    message: string,
    opts?: { userSafeMessage?: string; retryable?: boolean }
  ) {
    super(message);
    this.name = 'ProviderError';
    this.kind = kind;
    this.retryable = opts?.retryable ?? false;
    this.userSafeMessage =
      opts?.userSafeMessage ??
      (kind === 'timeout'
        ? 'Generation timed out. Your credits have been refunded.'
        : kind === 'canceled'
          ? 'Generation was canceled. Your credits have been refunded.'
          : 'Generation failed. Your credits have been refunded.');
  }
}

/**
 * A video provider orchestrated by the worker. Implementations must be side-effect isolated
 * per job (use input.workDir), honor the completion timeout and abort signal, and translate
 * their own failures into ProviderError.
 */
export interface VideoProvider {
  readonly name: string;
  createJob(input: ProviderJobInput): Promise<ProviderHandle>;
  awaitCompletion(handle: ProviderHandle, input: ProviderJobInput, opts: CompletionOptions): Promise<void>;
  collectArtifacts(handle: ProviderHandle, input: ProviderJobInput): Promise<ProviderArtifacts>;
  cancel(handle: ProviderHandle, input: ProviderJobInput): Promise<void>;
}
