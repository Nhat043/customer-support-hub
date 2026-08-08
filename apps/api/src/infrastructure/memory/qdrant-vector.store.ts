import { Injectable } from "@nestjs/common";
import { QdrantClient } from "@qdrant/js-client-rest";
import { EMBEDDING_DIMENSIONS } from "./embedding.provider";
import { MemoryVectorFilter, MemoryVectorMatch, MemoryVectorPoint, VectorStore } from "./vector-store";

@Injectable()
export class QdrantVectorStore implements VectorStore {
  readonly name = "qdrant";
  private initialized = false;

  constructor(
    private readonly client: QdrantClient,
    private readonly collectionName: string
  ) {}

  async upsert(point: MemoryVectorPoint): Promise<void> {
    await this.ensureCollection();
    await this.client.upsert(this.collectionName, {
      wait: true,
      points: [{
        id: point.id,
        vector: point.vector,
        payload: {
          organizationId: point.organizationId,
          userId: point.userId,
          workspaceId: point.workspaceId ?? "",
          text: point.text,
          sourceType: point.sourceType,
          sourceId: point.sourceId ?? ""
        }
      }]
    });
  }

  async search(vector: number[], filter: MemoryVectorFilter, limit: number): Promise<MemoryVectorMatch[]> {
    await this.ensureCollection();
    const must: Array<Record<string, unknown>> = [
      { key: "organizationId", match: { value: filter.organizationId } },
      { key: "userId", match: { value: filter.userId } }
    ];
    if (filter.workspaceId) must.push({ key: "workspaceId", match: { value: filter.workspaceId } });
    const matches = await this.client.search(this.collectionName, {
      vector,
      limit,
      with_payload: true,
      filter: { must }
    });
    return matches.map((match) => {
      const payload = (match.payload ?? {}) as Record<string, unknown>;
      return {
        id: String(match.id),
        organizationId: String(payload.organizationId),
        userId: String(payload.userId),
        workspaceId: payload.workspaceId ? String(payload.workspaceId) : undefined,
        text: String(payload.text ?? ""),
        sourceType: String(payload.sourceType ?? "unknown"),
        sourceId: payload.sourceId ? String(payload.sourceId) : undefined,
        score: match.score
      };
    });
  }

  private async ensureCollection() {
    if (this.initialized) return;
    try {
      await this.client.getCollection(this.collectionName);
    } catch {
      await this.client.createCollection(this.collectionName, {
        vectors: { size: EMBEDDING_DIMENSIONS, distance: "Cosine" }
      });
    }
    this.initialized = true;
  }
}
