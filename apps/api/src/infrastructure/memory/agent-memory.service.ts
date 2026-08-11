import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "../../../node_modules/.prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { EMBEDDING_PROVIDER, EmbeddingProvider } from "./embedding.provider";
import { MemoryVectorFilter, MemoryVectorMatch, VECTOR_STORE, VectorStore } from "./vector-store";

export type AgentMemoryContext = MemoryVectorMatch;
type PrivateMemoryFilter = MemoryVectorFilter & { userId: string };

@Injectable()
export class AgentMemoryService {
  private readonly logger = new Logger("AgentMemory");

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMBEDDING_PROVIDER) private readonly embeddings: EmbeddingProvider,
    @Inject(VECTOR_STORE) private readonly vectorStore: VectorStore
  ) {}

  async retrieve(filter: PrivateMemoryFilter, query: string, limit = 5): Promise<AgentMemoryContext[]> {
    try {
      const vector = await this.embeddings.embed(query, "RETRIEVAL_QUERY");
      return await this.vectorStore.search(vector, filter, limit);
    } catch (error) {
      this.logger.warn(`Memory retrieval skipped: ${error instanceof Error ? error.message : "unknown error"}`);
      return [];
    }
  }

  async remember(input: PrivateMemoryFilter & {
    agentRunId: string;
    sourceType: string;
    sourceId?: string;
    text: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    try {
      const id = randomUUID();
      const vector = await this.embeddings.embed(input.text);
      const chunk = await this.prisma.agentMemoryChunk.create({
        data: {
          id,
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          userId: input.userId,
          agentRunId: input.agentRunId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          chunkText: input.text,
          embeddingRef: `${this.vectorStore.name}:${id}`,
          metadata: input.metadata
        }
      });
      await this.vectorStore.upsert({
        id,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        userId: input.userId,
        vector,
        text: input.text,
        sourceType: input.sourceType,
        sourceId: input.sourceId
      });
      return chunk;
    } catch (error) {
      this.logger.warn(`Memory write skipped: ${error instanceof Error ? error.message : "unknown error"}`);
      return null;
    }
  }

  list(filter: PrivateMemoryFilter) {
    return this.prisma.agentMemoryChunk.findMany({
      where: {
        organizationId: filter.organizationId,
        userId: filter.userId,
        ...(filter.workspaceId ? { workspaceId: filter.workspaceId } : {})
      },
      select: {
        id: true,
        workspaceId: true,
        sourceType: true,
        sourceId: true,
        chunkText: true,
        embeddingRef: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" },
      take: 50
    });
  }

  async clear(filter: PrivateMemoryFilter) {
    const where = {
      organizationId: filter.organizationId,
      userId: filter.userId,
      ...(filter.workspaceId ? { workspaceId: filter.workspaceId } : {})
    };
    const chunks = await this.prisma.agentMemoryChunk.findMany({
      where,
      select: { id: true }
    });
    await this.vectorStore.delete(chunks.map((chunk) => chunk.id));
    const result = await this.prisma.agentMemoryChunk.deleteMany({ where });
    return result.count;
  }
}
