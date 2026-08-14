import assert from "node:assert/strict";
import test from "node:test";
import { AttachmentsService } from "../../../src/modules/attachments/attachments.service";

const item = { id: "item-1", organizationId: "org-1", workspaceId: "workspace-1" };
const uploadedFile = {
  originalname: "invoice.pdf",
  mimetype: "application/pdf",
  size: 42,
  buffer: Buffer.from("pdf content")
};

test("upload stores a tenant-scoped object and persists attachment metadata with an audit log", async () => {
  const calls: { stored?: any; attachment?: any; audit?: any } = {};
  const storage = { put: async (input: any) => { calls.stored = input; }, get: async () => ({ content: Buffer.alloc(0), contentType: "application/pdf" }), delete: async () => undefined };
  const prisma = {
    workflowItem: { findFirst: async () => item },
    $transaction: async (callback: any) => callback({
      attachment: { create: async ({ data }: any) => { calls.attachment = data; return { id: "attachment-1", ...data }; } },
      auditLog: { create: async ({ data }: any) => { calls.audit = data; return data; } }
    })
  };
  const service = new AttachmentsService(prisma as any, storage as any);

  const attachment = await service.upload({ organizationId: "org-1", workflowItemId: "item-1", uploadedById: "user-1", file: uploadedFile });

  assert.equal(attachment.id, "attachment-1");
  assert.match(calls.stored.storageKey, /^organizations\/org-1\/workspaces\/workspace-1\/workflow-items\/item-1\//);
  assert.equal(calls.attachment.fileName, "invoice.pdf");
  assert.equal(calls.attachment.uploadedById, "user-1");
  assert.equal(calls.audit.action, "ATTACHMENT_UPLOADED");
});

test("upload rejects unsupported files before writing object storage", async () => {
  let writeAttempted = false;
  const storage = { put: async () => { writeAttempted = true; }, get: async () => ({ content: Buffer.alloc(0), contentType: "" }), delete: async () => undefined };
  const prisma = { workflowItem: { findFirst: async () => item } };
  const service = new AttachmentsService(prisma as any, storage as any);

  await assert.rejects(
    () => service.upload({ organizationId: "org-1", workflowItemId: "item-1", uploadedById: "user-1", file: { ...uploadedFile, mimetype: "application/x-msdownload" } }),
    /Only PDF, JPG, PNG, WEBP, and plain text files are supported/
  );
  assert.equal(writeAttempted, false);
});

test("upload removes the stored object when the database transaction fails", async () => {
  const removed: string[] = [];
  const storage = { put: async () => undefined, get: async () => ({ content: Buffer.alloc(0), contentType: "" }), delete: async (key: string) => { removed.push(key); } };
  const prisma = {
    workflowItem: { findFirst: async () => item },
    $transaction: async () => { throw new Error("database unavailable"); }
  };
  const service = new AttachmentsService(prisma as any, storage as any);

  await assert.rejects(() => service.upload({ organizationId: "org-1", workflowItemId: "item-1", uploadedById: "user-1", file: uploadedFile }), /database unavailable/);
  assert.equal(removed.length, 1);
  assert.match(removed[0]!, /^organizations\/org-1\//);
});

test("download scopes attachment lookup to the workflow item and organization", async () => {
  let attachmentQuery: any;
  const storage = { put: async () => undefined, get: async () => ({ content: Buffer.from("file"), contentType: "application/pdf" }), delete: async () => undefined };
  const prisma = {
    workflowItem: { findFirst: async () => item },
    attachment: { findFirst: async (query: any) => { attachmentQuery = query; return { id: "attachment-1", storageKey: "organizations/org-1/file", fileName: "invoice.pdf", mimeType: "application/pdf" }; } }
  };
  const service = new AttachmentsService(prisma as any, storage as any);

  const result = await service.download("org-1", "item-1", "attachment-1");

  assert.equal(result.content.toString(), "file");
  assert.deepEqual(attachmentQuery.where, { id: "attachment-1", organizationId: "org-1", workflowItemId: "item-1" });
});

test("owner can delete another user's attachment and records an audit log", async () => {
  const calls: { deletedObject?: string; deletedAttachment?: any; audit?: any } = {};
  const storage = {
    put: async () => undefined,
    get: async () => ({ content: Buffer.alloc(0), contentType: "" }),
    delete: async (key: string) => { calls.deletedObject = key; }
  };
  const prisma = {
    workflowItem: { findFirst: async () => item },
    attachment: { findFirst: async () => ({ id: "attachment-1", uploadedById: "member-1", storageKey: "organizations/org-1/file", fileName: "invoice.pdf" }) },
    $transaction: async (callback: any) => callback({
      attachment: { delete: async (input: any) => { calls.deletedAttachment = input; } },
      auditLog: { create: async ({ data }: any) => { calls.audit = data; } }
    })
  };
  const service = new AttachmentsService(prisma as any, storage as any);

  await service.remove({ organizationId: "org-1", workflowItemId: "item-1", attachmentId: "attachment-1", actorUserId: "owner-1", role: "OWNER" });

  assert.equal(calls.deletedObject, "organizations/org-1/file");
  assert.deepEqual(calls.deletedAttachment, { where: { id: "attachment-1" } });
  assert.equal(calls.audit.action, "ATTACHMENT_DELETED");
});

test("member cannot delete another user's attachment", async () => {
  const storage = { put: async () => undefined, get: async () => ({ content: Buffer.alloc(0), contentType: "" }), delete: async () => undefined };
  const prisma = {
    workflowItem: { findFirst: async () => item },
    attachment: { findFirst: async () => ({ id: "attachment-1", uploadedById: "member-1", storageKey: "organizations/org-1/file", fileName: "invoice.pdf" }) }
  };
  const service = new AttachmentsService(prisma as any, storage as any);

  await assert.rejects(
    () => service.remove({ organizationId: "org-1", workflowItemId: "item-1", attachmentId: "attachment-1", actorUserId: "member-2", role: "MEMBER" }),
    /Only the uploader, workspace owner, or admin can delete an attachment/
  );
});
