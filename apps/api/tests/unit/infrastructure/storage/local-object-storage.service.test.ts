import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalObjectStorageService } from "../../../../src/infrastructure/storage/local-object-storage.service";

test("local object storage writes, reads, and deletes a nested private object", async () => {
  const directory = await mkdtemp(join(tmpdir(), "customer-support-hub-storage-"));
  const storage = new LocalObjectStorageService({ get: () => directory } as any);

  try {
    await storage.put({
      storageKey: "organizations/org-1/workflow-items/item-1/file",
      content: Buffer.from("customer attachment"),
      contentType: "text/plain"
    });
    const object = await storage.get("organizations/org-1/workflow-items/item-1/file");
    assert.equal(object.content.toString(), "customer attachment");

    await storage.delete("organizations/org-1/workflow-items/item-1/file");
    await assert.rejects(() => storage.get("organizations/org-1/workflow-items/item-1/file"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("local object storage rejects a key that tries to escape its root directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "customer-support-hub-storage-"));
  const storage = new LocalObjectStorageService({ get: () => directory } as any);

  try {
    await assert.rejects(
      () => storage.put({ storageKey: "../../outside", content: Buffer.from("no"), contentType: "text/plain" }),
      /Invalid object storage key/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
