import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { ObjectStorage, PutObjectInput, StoredObject } from "./object-storage";

@Injectable()
export class LocalObjectStorageService implements ObjectStorage {
  private readonly rootDirectory: string;

  constructor(configService: ConfigService) {
    this.rootDirectory = resolve(configService.get<string>("LOCAL_UPLOAD_DIR") ?? "/tmp/customer-support-hub-uploads");
  }

  async put(input: PutObjectInput): Promise<void> {
    const destination = this.resolvePath(input.storageKey);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, input.content, { flag: "wx" });
  }

  async get(storageKey: string): Promise<StoredObject> {
    return {
      content: await readFile(this.resolvePath(storageKey)),
      contentType: "application/octet-stream"
    };
  }

  async delete(storageKey: string): Promise<void> {
    await rm(this.resolvePath(storageKey), { force: true });
  }

  private resolvePath(storageKey: string) {
    const destination = resolve(join(this.rootDirectory, storageKey));
    if (!destination.startsWith(`${this.rootDirectory}/`)) {
      throw new Error("Invalid object storage key");
    }
    return destination;
  }
}
