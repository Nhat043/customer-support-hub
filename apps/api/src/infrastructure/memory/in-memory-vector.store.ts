import { Injectable } from "@nestjs/common";
import { MemoryVectorFilter, MemoryVectorMatch, MemoryVectorPoint, VectorStore } from "./vector-store";

@Injectable()
export class InMemoryVectorStore implements VectorStore {
  readonly name = "in-memory";
  private readonly points = new Map<string, MemoryVectorPoint>();

  async upsert(point: MemoryVectorPoint): Promise<void> {
    this.points.set(point.id, point);
  }

  async search(vector: number[], filter: MemoryVectorFilter, limit: number): Promise<MemoryVectorMatch[]> {
    return [...this.points.values()]
      .filter((point) =>
        point.organizationId === filter.organizationId &&
        (!filter.userId || point.userId === filter.userId) &&
        (!filter.workspaceId || point.workspaceId === filter.workspaceId) &&
        (!filter.sourceType || point.sourceType === filter.sourceType)
      )
      .map((point) => ({
        id: point.id,
        organizationId: point.organizationId,
        userId: point.userId,
        workspaceId: point.workspaceId,
        text: point.text,
        sourceType: point.sourceType,
        sourceId: point.sourceId,
        score: cosineSimilarity(vector, point.vector)
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }

  async delete(ids: string[]): Promise<void> {
    ids.forEach((id) => this.points.delete(id));
  }
}

function cosineSimilarity(left: number[], right: number[]) {
  const size = Math.min(left.length, right.length);
  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < size; index += 1) {
    dotProduct += left[index]! * right[index]!;
    leftMagnitude += left[index]! * left[index]!;
    rightMagnitude += right[index]! * right[index]!;
  }
  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude) || 1);
}
