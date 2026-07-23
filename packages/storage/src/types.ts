export interface StoredObject {
  key: string;
  size: number;
}

/**
 * Storage abstraction. The app addresses artifacts by opaque key; the driver decides where
 * bytes live and how a client reaches them (an authenticated app route for local, a signed
 * URL for S3/R2).
 */
export interface StorageDriver {
  readonly name: string;
  /** Store bytes from a local file path under key. */
  putFile(key: string, filePath: string, contentType: string): Promise<StoredObject>;
  /** Store bytes from a buffer under key. */
  put(key: string, data: Buffer, contentType: string): Promise<StoredObject>;
  /** Read all bytes for key. */
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /**
   * A URL a browser can use to fetch the object. For local storage this is an app-relative
   * path served by an authenticated route; for S3 it is a time-limited signed URL.
   */
  url(key: string): Promise<string>;
  /** Content type recorded for key, if the driver tracks it. */
  contentType(key: string): Promise<string | undefined>;
}
