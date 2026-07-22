import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LocalStorageDriver } from './local';

let root: string;
let store: LocalStorageDriver;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'reelforge-storage-'));
  store = new LocalStorageDriver({ root });
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('LocalStorageDriver', () => {
  it('puts and gets a buffer with content type', async () => {
    const data = Buffer.from('hello video');
    const res = await store.put('videos/a/out.mp4', data, 'video/mp4');
    expect(res.size).toBe(data.byteLength);
    expect((await store.get('videos/a/out.mp4')).toString()).toBe('hello video');
    expect(await store.contentType('videos/a/out.mp4')).toBe('video/mp4');
  });

  it('puts from a file path', async () => {
    const src = path.join(root, 'src.bin');
    writeFileSync(src, 'from-file');
    await store.putFile('k/thumb.jpg', src, 'image/jpeg');
    expect((await store.get('k/thumb.jpg')).toString()).toBe('from-file');
  });

  it('reports existence and deletes', async () => {
    await store.put('x/y.mp4', Buffer.from('z'), 'video/mp4');
    expect(await store.exists('x/y.mp4')).toBe(true);
    await store.delete('x/y.mp4');
    expect(await store.exists('x/y.mp4')).toBe(false);
  });

  it('returns an authenticated app-route URL', async () => {
    const url = await store.url('videos/a/out.mp4');
    expect(url).toMatch(/^\/api\/files\/videos\/a\/out\.mp4\?v=/);
  });

  it('rejects path traversal keys', async () => {
    await expect(store.put('../escape.mp4', Buffer.from('x'), 'video/mp4')).rejects.toThrow();
    await expect(store.get('/etc/passwd')).rejects.toThrow();
  });

  it('resolvePath stays inside root', () => {
    expect(store.resolvePath('a/b.mp4')).toBe(path.join(root, 'a/b.mp4'));
  });
});
