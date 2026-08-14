export type PutObjectInput = {
  storageKey: string;
  content: Buffer;
  contentType: string;
};

export type StoredObject = {
  content: Buffer;
  contentType: string;
};

export interface ObjectStorage {
  put(input: PutObjectInput): Promise<void>;
  get(storageKey: string): Promise<StoredObject>;
  delete(storageKey: string): Promise<void>;
}

export const OBJECT_STORAGE = Symbol("OBJECT_STORAGE");
