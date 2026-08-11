import test from "node:test";
import assert from "node:assert/strict";
import { AgentMemoryService } from "../../../../src/infrastructure/memory/agent-memory.service";
import {
  DETERMINISTIC_EMBEDDING_DIMENSIONS,
  DeterministicEmbeddingProvider
} from "../../../../src/infrastructure/memory/embedding.provider";
import { InMemoryVectorStore } from "../../../../src/infrastructure/memory/in-memory-vector.store";
import { QdrantVectorStore } from "../../../../src/infrastructure/memory/qdrant-vector.store";

test("deterministic embedding is stable and normalized", async () => {
  const embeddings = new DeterministicEmbeddingProvider();
  const first = await embeddings.embed("workflow approval");
  const second = await embeddings.embed("workflow approval");
  const magnitude = Math.sqrt(first.reduce((total, value) => total + value * value, 0));

  assert.equal(first.length, DETERMINISTIC_EMBEDDING_DIMENSIONS);
  assert.deepEqual(first, second);
  assert.ok(Math.abs(magnitude - 1) < 0.000_001);
});

test("in-memory vector store enforces organization, user, and workspace filters", async () => {
  const store = new InMemoryVectorStore();
  await store.upsert({
    id: "memory-a",
    organizationId: "org-a",
    userId: "user-a",
    workspaceId: "workspace-a",
    vector: [1, 0],
    text: "Relevant memory",
    sourceType: "agent_run"
  });
  await store.upsert({
    id: "memory-b",
    organizationId: "org-b",
    userId: "user-a",
    vector: [1, 0],
    text: "Other tenant memory",
    sourceType: "agent_run"
  });

  const matches = await store.search([1, 0], {
    organizationId: "org-a",
    userId: "user-a",
    workspaceId: "workspace-a"
  }, 5);
  assert.deepEqual(matches.map((match) => match.id), ["memory-a"]);

  await store.delete(["memory-a"]);
  assert.deepEqual(await store.search([1, 0], {
    organizationId: "org-a",
    userId: "user-a",
    workspaceId: "workspace-a"
  }, 5), []);
});

test("in-memory vector store can retrieve workspace knowledge without exposing private agent memory", async () => {
  const store = new InMemoryVectorStore();
  await store.upsert({
    id: "knowledge-a",
    organizationId: "org-a",
    workspaceId: "workspace-a",
    vector: [1, 0],
    text: "Delivery knowledge",
    sourceType: "knowledge"
  });
  await store.upsert({
    id: "memory-a",
    organizationId: "org-a",
    userId: "user-a",
    workspaceId: "workspace-a",
    vector: [1, 0],
    text: "Private memory",
    sourceType: "agent_run"
  });

  const matches = await store.search([1, 0], {
    organizationId: "org-a",
    workspaceId: "workspace-a",
    sourceType: "knowledge"
  }, 5);
  assert.deepEqual(matches.map((match) => match.id), ["knowledge-a"]);
});

test("agent memory clear removes the same tenant-scoped chunks from the vector store and database", async () => {
  const deletedVectors: string[][] = [];
  const deletedQueries: Array<Record<string, unknown>> = [];
  const service = new AgentMemoryService(
    {
      agentMemoryChunk: {
        findMany: async () => [{ id: "memory-a" }, { id: "memory-b" }],
        deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
          deletedQueries.push(where);
          return { count: 2 };
        }
      }
    } as any,
    { embed: async () => [1, 0] },
    { name: "test-store", upsert: async () => undefined, search: async () => [], delete: async (ids: string[]) => { deletedVectors.push(ids); } } as any
  );

  assert.equal(await service.clear({ organizationId: "org-a", userId: "user-a", workspaceId: "workspace-a" }), 2);
  assert.deepEqual(deletedVectors, [["memory-a", "memory-b"]]);
  assert.deepEqual(deletedQueries, [{ organizationId: "org-a", userId: "user-a", workspaceId: "workspace-a" }]);
});

test("agent memory persists metadata and indexes the same chunk id", async () => {
  const created: Array<Record<string, unknown>> = [];
  const indexed: Array<Record<string, unknown>> = [];
  const service = new AgentMemoryService(
    {
      agentMemoryChunk: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return data;
        },
        findMany: async () => [{ id: "memory-history" }]
      }
    } as any,
    { embed: async () => [1, 0] },
    {
      name: "test-store",
      upsert: async (point: Record<string, unknown>) => { indexed.push(point); },
      search: async () => [{
        id: "memory-1",
        organizationId: "org-a",
        userId: "user-a",
        text: "Relevant memory",
        sourceType: "agent_run",
        score: 0.9
      }]
    } as any
  );

  const chunk = await service.remember({
    organizationId: "org-a",
    userId: "user-a",
    agentRunId: "run-a",
    sourceType: "agent_run",
    text: "A prior agent decision"
  });
  const matches = await service.retrieve({ organizationId: "org-a", userId: "user-a" }, "prior decision");

  assert.equal(chunk?.embeddingRef?.startsWith("test-store:"), true);
  assert.equal(created[0]?.id, indexed[0]?.id);
  assert.equal(matches[0]?.id, "memory-1");
  assert.deepEqual(await service.list({ organizationId: "org-a", userId: "user-a" }), [{ id: "memory-history" }]);
});

test("Qdrant adapter creates the collection and applies tenant filters", async () => {
  const calls: Array<{ name: string; input?: unknown }> = [];
  const client = {
    getCollection: async () => {
      calls.push({ name: "getCollection" });
      throw new Error("collection not found");
    },
    createCollection: async (_name: string, input: unknown) => { calls.push({ name: "createCollection", input }); },
    upsert: async (_name: string, input: unknown) => { calls.push({ name: "upsert", input }); },
    delete: async (_name: string, input: unknown) => { calls.push({ name: "delete", input }); },
    search: async (_name: string, input: unknown) => {
      calls.push({ name: "search", input });
      return [{
        id: "memory-1",
        score: 0.91,
        payload: {
          organizationId: "org-a",
          userId: "user-a",
          workspaceId: "workspace-a",
          text: "Relevant memory",
          sourceType: "agent_run",
          sourceId: "run-a"
        }
      }];
    }
  } as any;
  const store = new QdrantVectorStore(client, "agent_memory", 64);

  await store.upsert({
    id: "memory-1",
    organizationId: "org-a",
    userId: "user-a",
    workspaceId: "workspace-a",
    vector: new Array(64).fill(0.1),
    text: "Relevant memory",
    sourceType: "agent_run",
    sourceId: "run-a"
  });
  const results = await store.search(new Array(64).fill(0.1), {
    organizationId: "org-a",
    userId: "user-a",
    workspaceId: "workspace-a"
  }, 5);
  await store.delete(["memory-1"]);

  assert.equal(calls.filter((call) => call.name === "createCollection").length, 1);
  assert.equal((calls.find((call) => call.name === "upsert")?.input as any).points[0].payload.organizationId, "org-a");
  assert.equal((calls.find((call) => call.name === "search")?.input as any).filter.must.length, 3);
  assert.deepEqual((calls.find((call) => call.name === "delete")?.input as any).points, ["memory-1"]);
  assert.equal(results[0]?.sourceId, "run-a");
});

test("Qdrant adapter rejects a collection created for a different embedding dimension", async () => {
  const client = {
    getCollection: async () => ({ config: { params: { vectors: { size: 64 } } } }),
    createCollection: async () => assert.fail("must not overwrite an existing collection"),
    upsert: async () => undefined
  } as any;
  const store = new QdrantVectorStore(client, "agent_memory", 768);

  await assert.rejects(
    store.upsert({
      id: "memory-1",
      organizationId: "org-a",
      userId: "user-a",
      vector: new Array(768).fill(0.1),
      text: "Relevant memory",
      sourceType: "agent_run"
    }),
    /dimension 64; expected 768/
  );
});
