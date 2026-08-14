import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GcsObjectStorageService } from "./gcs-object-storage.service";
import { LocalObjectStorageService } from "./local-object-storage.service";
import { OBJECT_STORAGE } from "./object-storage";

@Module({
  providers: [
    LocalObjectStorageService,
    GcsObjectStorageService,
    {
      provide: OBJECT_STORAGE,
      inject: [ConfigService, LocalObjectStorageService, GcsObjectStorageService],
      useFactory: (
        configService: ConfigService,
        localObjectStorage: LocalObjectStorageService,
        gcsObjectStorage: GcsObjectStorageService
      ) => configService.get<string>("STORAGE_PROVIDER") === "gcs" ? gcsObjectStorage : localObjectStorage
    }
  ],
  exports: [OBJECT_STORAGE]
})
export class StorageModule {}
