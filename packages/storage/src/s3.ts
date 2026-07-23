// S3-compatible storage (AWS S3 or Cloudflare R2) for production. Objects are private;
// clients receive time-limited signed GET URLs. The AWS SDK is imported dynamically so it
// is never loaded or bundled unless STORAGE_DRIVER=s3.
//
// NOT exercised in this sandbox (no S3 reachable). Verified by construction against the
// documented SDK surface; see README production runbook.
import { readFile } from 'node:fs/promises';
import { envInt } from '@reelforge/core/env';
import type { StorageDriver, StoredObject } from './types';

export interface S3StorageOptions {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  signedUrlTtlSeconds: number;
}

// Minimal structural types so this file typechecks without the AWS SDK installed at
// check time; the real classes are loaded at runtime via dynamic import.
type S3ClientLike = {
  send: (cmd: unknown) => Promise<{ Body?: unknown; ContentType?: string }>;
};

export class S3StorageDriver implements StorageDriver {
  readonly name = 's3';
  private readonly opts: S3StorageOptions;
  private clientPromise?: Promise<S3ClientLike>;
  private sdkPromise?: Promise<typeof import('@aws-sdk/client-s3')>;

  constructor(opts: S3StorageOptions) {
    this.opts = opts;
  }

  private async sdk() {
    this.sdkPromise ??= import('@aws-sdk/client-s3');
    return this.sdkPromise;
  }

  private async client(): Promise<S3ClientLike> {
    this.clientPromise ??= (async () => {
      const { S3Client } = await this.sdk();
      return new S3Client({
        region: this.opts.region,
        endpoint: this.opts.endpoint || undefined,
        forcePathStyle: this.opts.forcePathStyle,
        credentials: {
          accessKeyId: this.opts.accessKeyId,
          secretAccessKey: this.opts.secretAccessKey,
        },
      }) as unknown as S3ClientLike;
    })();
    return this.clientPromise;
  }

  async putFile(key: string, filePath: string, contentType: string): Promise<StoredObject> {
    const data = await readFile(filePath);
    return this.put(key, data, contentType);
  }

  async put(key: string, data: Buffer, contentType: string): Promise<StoredObject> {
    const { PutObjectCommand } = await this.sdk();
    const client = await this.client();
    await client.send(
      new PutObjectCommand({
        Bucket: this.opts.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      })
    );
    return { key, size: data.byteLength };
  }

  async get(key: string): Promise<Buffer> {
    const { GetObjectCommand } = await this.sdk();
    const client = await this.client();
    const res = await client.send(new GetObjectCommand({ Bucket: this.opts.bucket, Key: key }));
    const body = res.Body as { transformToByteArray: () => Promise<Uint8Array> };
    return Buffer.from(await body.transformToByteArray());
  }

  async exists(key: string): Promise<boolean> {
    const { HeadObjectCommand } = await this.sdk();
    const client = await this.client();
    try {
      await client.send(new HeadObjectCommand({ Bucket: this.opts.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    const { DeleteObjectCommand } = await this.sdk();
    const client = await this.client();
    await client.send(new DeleteObjectCommand({ Bucket: this.opts.bucket, Key: key }));
  }

  async contentType(key: string): Promise<string | undefined> {
    const { HeadObjectCommand } = await this.sdk();
    const client = await this.client();
    try {
      const res = await client.send(new HeadObjectCommand({ Bucket: this.opts.bucket, Key: key }));
      return res.ContentType;
    } catch {
      return undefined;
    }
  }

  async url(key: string): Promise<string> {
    const { GetObjectCommand } = await this.sdk();
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const client = await this.client();
    return getSignedUrl(
      client as never,
      new GetObjectCommand({ Bucket: this.opts.bucket, Key: key }) as never,
      { expiresIn: this.opts.signedUrlTtlSeconds }
    );
  }
}

export function s3OptionsFromEnv(): S3StorageOptions {
  const required = (name: string): string => {
    const v = process.env[name];
    if (!v) throw new Error(`${name} is required for STORAGE_DRIVER=s3`);
    return v;
  };
  return {
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION || 'auto',
    bucket: required('S3_BUCKET'),
    accessKeyId: required('S3_ACCESS_KEY_ID'),
    secretAccessKey: required('S3_SECRET_ACCESS_KEY'),
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? '1') === '1',
    signedUrlTtlSeconds: envInt('S3_SIGNED_URL_TTL_SECONDS', 900),
  };
}
