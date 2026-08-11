import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createRequire } from "node:module";
import process from "node:process";

const require = createRequire(import.meta.url);
const { QdrantClient } = require("@qdrant/js-client-rest");

const enabled = process.env.RUN_INTEGRATION_TESTS === "true";
const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:4000/api";
const qdrantUrl = process.env.QDRANT_URL ?? "http://localhost:6333";

test("Docker API health endpoint responds", { skip: !enabled }, async () => {
  const response = await globalThis.fetch(`${apiBaseUrl}/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.ok(Number.isFinite(Date.parse(body.timestamp)));
});

test("Qdrant applies semantic memory tenant and workspace filters", { skip: !enabled }, async () => {
  const client = new QdrantClient({ url: qdrantUrl });
  const collection = `customer_support_hub_it_${randomUUID().replaceAll("-", "")}`;
  const visibleMemoryId = randomUUID();
  const otherWorkspaceMemoryId = randomUUID();
  const otherTenantMemoryId = randomUUID();
  await client.createCollection(collection, {
    vectors: { size: 3, distance: "Cosine" },
  });

  try {
    await client.upsert(collection, {
      wait: true,
      points: [
        {
          id: visibleMemoryId,
          vector: [1, 0, 0],
          payload: { organizationId: "org-a", userId: "user-a", workspaceId: "workspace-a" },
        },
        {
          id: otherWorkspaceMemoryId,
          vector: [1, 0, 0],
          payload: { organizationId: "org-a", userId: "user-a", workspaceId: "workspace-b" },
        },
        {
          id: otherTenantMemoryId,
          vector: [1, 0, 0],
          payload: { organizationId: "org-b", userId: "user-a", workspaceId: "workspace-a" },
        },
      ],
    });
    const result = await client.search(collection, {
      vector: [1, 0, 0],
      limit: 10,
      filter: {
        must: [
          { key: "organizationId", match: { value: "org-a" } },
          { key: "userId", match: { value: "user-a" } },
          { key: "workspaceId", match: { value: "workspace-a" } },
        ],
      },
    });

    assert.deepEqual(result.map((point) => point.id), [visibleMemoryId]);
  } finally {
    await client.deleteCollection(collection);
  }
});
