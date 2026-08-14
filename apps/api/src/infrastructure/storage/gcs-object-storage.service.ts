import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Storage } from "@google-cloud/storage";
import type { ObjectStorage, PutObjectInput, StoredObject } from "./object-storage";

@Injectable()
export class GcsObjectStorageService implements ObjectStorage {
  private readonly bucketName?: string;
  private readonly storage: Storage;

  constructor(configService: ConfigService) {
    this.bucketName = configService.get<string>("GCS_ATTACHMENT_BUCKET");
    this.storage = new Storage({ projectId: configService.get<string>("GCS_PROJECT_ID") });
  }

  async put(input: PutObjectInput): Promise<void> {
    await this.bucket().file(input.storageKey).save(input.content, {
      resumable: false,
      metadata: { contentType: input.contentType }
    });
  }

  async get(storageKey: string): Promise<StoredObject> {
    const file = this.bucket().file(storageKey);
    const [content] = await file.download();
    const [metadata] = await file.getMetadata();
    return { content, contentType: metadata.contentType ?? "application/octet-stream" };
  }

  async delete(storageKey: string): Promise<void> {
    await this.bucket().file(storageKey).delete({ ignoreNotFound: true });
  }

  private bucket() {
    if (!this.bucketName) {
      throw new InternalServerErrorException("GCS attachment storage is not configured");
    }
    return this.storage.bucket(this.bucketName);
  }
}
