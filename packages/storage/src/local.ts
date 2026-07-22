// Local-disk storage for dev/test. Bytes live under a root directory; the browser reaches
// them through an authenticated app route (/api/files/<key>), so access is still gated by
// the session rather than being a public file server. A sidecar .meta.json per object
// records its content type.
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { repoRootPath } from '@reelforge/core/env';
import type { StorageDriver, StoredObject } from './types';

export interface LocalStorageOptions {
  root: string;
  /** URL prefix for the authenticated file route. Default /api/files */
  urlPrefix?: string;
}

function assertSafeKey(key: string): void {
  if (key.startsWith('/') || key.includes('..') || key.includes('\0')) {
    throw new Error(`unsafe storage key: ${key}`);
  }
}

export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local';
  private readonly root: string;
  private readonly urlPrefix: string;

  constructor(opts: LocalStorageOptions) {
    this.root = path.isAbsolute(opts.root) ? opts.root : path.resolve(repoRootPath(), opts.root);
    this.urlPrefix = opts.urlPrefix ?? '/api/files';
  }

  private full(key: string): string {
    assertSafeKey(key);
    return path.join(this.root, key);
  }

  private metaPath(key: string): string {
    return this.full(key) + '.meta.json';
  }

  private async writeMeta(key: string, contentType: string): Promise<void> {
    await writeFile(this.metaPath(key), JSON.stringify({ contentType }));
  }

  async putFile(key: string, filePath: string, contentType: string): Promise<StoredObject> {
    const dest = this.full(key);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(filePath, dest);
    await this.writeMeta(key, contentType);
    const { size } = await stat(dest);
    return { key, size };
  }

  async put(key: string, data: Buffer, contentType: string): Promise<StoredObject> {
    const dest = this.full(key);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, data);
    await this.writeMeta(key, contentType);
    return { key, size: data.byteLength };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.full(key));
  }

  async exists(key: string): Promise<boolean> {
    return existsSync(this.full(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.full(key), { force: true });
    await rm(this.metaPath(key), { force: true });
  }

  async contentType(key: string): Promise<string | undefined> {
    try {
      const meta = JSON.parse(await readFile(this.metaPath(key), 'utf8'));
      return meta.contentType;
    } catch {
      return undefined;
    }
  }

  async url(key: string): Promise<string> {
    assertSafeKey(key);
    // Cache-busting token derived from the key; the route itself enforces auth.
    const v = createHash('sha1').update(key).digest('hex').slice(0, 8);
    return `${this.urlPrefix}/${key}?v=${v}`;
  }

  /** Absolute path on disk for a key (used by the authenticated file route to stream). */
  resolvePath(key: string): string {
    return this.full(key);
  }
}
