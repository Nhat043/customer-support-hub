import assert from "node:assert/strict";
import test from "node:test";
import { WorkspaceKnowledgeService, chunkMarkdown } from "../../../src/modules/knowledge/knowledge.service";

test("Markdown chunker preserves the beginning and end of a long document with overlap", () => {
  const content = `# Delivery policy\n\n${"The customer receives an update after the carrier scans the parcel. ".repeat(20)}\n\n## Escalation\n\nContact operations after two business days.`;
  const chunks = chunkMarkdown(content, 160, 30);

  assert.ok(chunks.length > 2);
  assert.match(chunks[0]!, /^# Delivery policy/);
  assert.match(chunks.at(-1)!, /Contact operations after two business days\./);
  assert.ok(chunks[1]!.includes(chunks[0]!.slice(-20)));
});

test("knowledge upload chunks, embeds, and indexes only the active tenant workspace", async () => {
  const indexed: Array<Record<string, unknown>> = [];
  const createdChunks: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  const service = new WorkspaceKnowledgeService({
    workspace: { findFirst: async () => ({ id: "workspace-a" }) },
    knowledgeDocument: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "document-1", title: data.title, fileName: data.fileName }),
      update: async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); return data; }
    },
    knowledgeChunk: {
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { createdChunks.push(...data); return { count: data.length }; }
    }
  } as any, {
    embed: async () => [1, 0]
  } as any, {
    name: "test-vector",
    upsert: async (point: Record<string, unknown>) => { indexed.push(point); },
    search: async () => [],
    delete: async () => undefined
  } as any);

  const result = await service.upload("org-a", "workspace-a", "user-a", {
    fileName: "delivery-policy.md",
    title: "Delivery policy",
    content: "# Delivery\n\nCustomers receive tracking updates."
  });

  assert.equal(result.status, "READY");
  assert.equal(createdChunks.length, 1);
  assert.equal(indexed.length, 1);
  assert.deepEqual(indexed[0], {
    id: createdChunks[0]!.id,
    organizationId: "org-a",
    workspaceId: "workspace-a",
    vector: [1, 0],
    text: "# Delivery\n\nCustomers receive tracking updates.",
    sourceType: "knowledge",
    sourceId: "document-1"
  });
  assert.deepEqual(updates, [{ status: "READY" }]);
});

test("knowledge retrieval filters vector search and database lookup to the current tenant workspace", async () => {
  let receivedFilter: Record<string, unknown> | undefined;
  let receivedWhere: Record<string, unknown> | undefined;
  const service = new WorkspaceKnowledgeService({
    workspace: { findFirst: async () => ({ id: "workspace-a" }) },
    knowledgeChunk: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        receivedWhere = where;
        return [{
          id: "chunk-a",
          content: "Refunds are processed in five business days.",
          document: { id: "document-a", title: "Refund policy", fileName: "refund-policy.md" }
        }];
      }
    }
  } as any, {
    embed: async () => [1, 0]
  } as any, {
    name: "test-vector",
    upsert: async () => undefined,
    delete: async () => undefined,
    search: async (_vector: number[], filter: Record<string, unknown>) => {
      receivedFilter = filter;
      return [
        { id: "chunk-a", organizationId: "org-a", workspaceId: "workspace-a", text: "Refunds are processed in five business days.", sourceType: "knowledge", score: 0.92 },
        { id: "private-memory", organizationId: "org-a", userId: "user-a", workspaceId: "workspace-a", text: "Private memory", sourceType: "agent_run", score: 0.99 }
      ];
    }
  } as any);

  const citations = await service.retrieve("org-a", "workspace-a", "When are refunds processed?");

  assert.deepEqual(receivedFilter, { organizationId: "org-a", workspaceId: "workspace-a", sourceType: "knowledge" });
  assert.deepEqual(receivedWhere, {
    id: { in: ["chunk-a", "private-memory"] },
    organizationId: "org-a",
    workspaceId: "workspace-a",
    document: { status: "READY" }
  });
  assert.deepEqual(citations, [{
    chunkId: "chunk-a",
    documentId: "document-a",
    title: "Refund policy",
    fileName: "refund-policy.md",
    excerpt: "Refunds are processed in five business days.",
    score: 0.92
  }]);
});

test("knowledge upload rejects duplicate content and records a failed index with vector cleanup", async () => {
  const duplicateService = new WorkspaceKnowledgeService({
    workspace: { findFirst: async () => ({ id: "workspace-a" }) },
    knowledgeDocument: { findFirst: async () => ({ id: "document-existing", title: "Existing policy" }) }
  } as any, { embed: async () => [1, 0] } as any, {} as any);

  await assert.rejects(
    duplicateService.upload("org-a", "workspace-a", "user-a", {
      fileName: "duplicate.md",
      content: "Same policy"
    }),
    /already has the same knowledge document/
  );

  const deletedVectors: string[][] = [];
  const updates: Array<Record<string, unknown>> = [];
  const failedService = new WorkspaceKnowledgeService({
    workspace: { findFirst: async () => ({ id: "workspace-a" }) },
    knowledgeDocument: {
      findFirst: async () => null,
      create: async () => ({ id: "document-failed", title: "Failed policy", fileName: "failed.md" }),
      update: async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); return data; }
    },
    knowledgeChunk: { createMany: async () => ({ count: 1 }) }
  } as any, {
    embed: async () => { throw new Error("embedding unavailable"); }
  } as any, {
    name: "test-vector",
    upsert: async () => undefined,
    search: async () => [],
    delete: async (ids: string[]) => { deletedVectors.push(ids); }
  } as any);

  await assert.rejects(
    failedService.upload("org-a", "workspace-a", "user-a", {
      fileName: "failed.md",
      content: "This document will fail to index."
    }),
    /could not be indexed/
  );
  assert.equal(deletedVectors[0]?.length, 1);
  assert.deepEqual(updates, [{ status: "FAILED" }]);
});

test("knowledge list and delete remain scoped to the active workspace", async () => {
  let deletedDocumentId: string | undefined;
  const deletedVectors: string[][] = [];
  const service = new WorkspaceKnowledgeService({
    workspace: { findFirst: async () => ({ id: "workspace-a" }) },
    knowledgeDocument: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        assert.deepEqual(where, { organizationId: "org-a", workspaceId: "workspace-a" });
        return [{ id: "document-a", title: "Playbook" }];
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        assert.deepEqual(where, { id: "document-a", organizationId: "org-a", workspaceId: "workspace-a" });
        return { id: "document-a", chunks: [{ id: "chunk-a" }, { id: "chunk-b" }] };
      },
      delete: async ({ where }: { where: { id: string } }) => { deletedDocumentId = where.id; return { id: where.id }; }
    }
  } as any, { embed: async () => [1, 0] } as any, {
    name: "test-vector",
    upsert: async () => undefined,
    search: async () => [],
    delete: async (ids: string[]) => { deletedVectors.push(ids); }
  } as any);

  assert.deepEqual(await service.list("org-a", "workspace-a"), [{ id: "document-a", title: "Playbook" }]);
  assert.deepEqual(await service.remove("org-a", "workspace-a", "document-a"), { deleted: true, documentId: "document-a" });
  assert.deepEqual(deletedVectors, [["chunk-a", "chunk-b"]]);
  assert.equal(deletedDocumentId, "document-a");
});

test("knowledge source detail remains tenant/workspace scoped and returns ordered chunks", async () => {
  let receivedWhere: Record<string, unknown> | undefined;
  const service = new WorkspaceKnowledgeService({
    workspace: { findFirst: async () => ({ id: "workspace-a" }) },
    knowledgeDocument: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        receivedWhere = where;
        return {
          id: "document-a",
          title: "Refund policy",
          fileName: "refund.md",
          status: "READY",
          chunkCount: 1,
          uploadedBy: { fullName: "Owner", email: "owner@example.com" },
          chunks: [{ id: "chunk-a", ordinal: 0, content: "Refund within five days.", createdAt: new Date("2026-01-01") }]
        };
      }
    }
  } as any, {} as any, {} as any);

  const detail = await service.getDocument("org-a", "workspace-a", "document-a");

  assert.deepEqual(receivedWhere, { id: "document-a", organizationId: "org-a", workspaceId: "workspace-a" });
  assert.equal(detail.chunks[0]?.content, "Refund within five days.");
});

test("failed knowledge document can retry existing chunks without another upload", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const deletedVectors: string[][] = [];
  const indexed: Array<Record<string, unknown>> = [];
  const service = new WorkspaceKnowledgeService({
    workspace: { findFirst: async () => ({ id: "workspace-a" }) },
    knowledgeDocument: {
      findFirst: async () => ({
        id: "document-failed",
        title: "Delivery policy",
        fileName: "delivery.md",
        status: "FAILED",
        chunkCount: 1,
        chunks: [{ id: "chunk-a", ordinal: 0, content: "Escalate after two days.", embeddingRef: "test:document-failed:0" }]
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); return data; }
    }
  } as any, { embed: async () => [1, 0] } as any, {
    name: "test-vector",
    search: async () => [],
    delete: async (ids: string[]) => { deletedVectors.push(ids); },
    upsert: async (point: Record<string, unknown>) => { indexed.push(point); }
  } as any);

  const result = await service.retry("org-a", "workspace-a", "document-failed");

  assert.equal(result.status, "READY");
  assert.deepEqual(deletedVectors, [["chunk-a"]]);
  assert.equal(indexed[0]?.sourceId, "document-failed");
  assert.deepEqual(updates, [{ status: "INDEXING" }, { status: "READY" }]);
});

test("knowledge retry rejects a document that is not in failed state", async () => {
  const service = new WorkspaceKnowledgeService({
    workspace: { findFirst: async () => ({ id: "workspace-a" }) },
    knowledgeDocument: {
      findFirst: async () => ({ id: "document-ready", title: "Ready", fileName: "ready.md", status: "READY", chunkCount: 1, chunks: [{ id: "chunk-a", content: "content", ordinal: 0 }] })
    }
  } as any, {} as any, {} as any);

  await assert.rejects(service.retry("org-a", "workspace-a", "document-ready"), /Only a failed knowledge document can be retried/);
});

test("knowledge retrieval is empty without an active workspace", async () => {
  const service = new WorkspaceKnowledgeService({} as any, {
    embed: async () => assert.fail("embedding must not run")
  } as any, {} as any);

  assert.deepEqual(await service.retrieve("org-a", undefined, "What is our refund policy?"), []);
});
