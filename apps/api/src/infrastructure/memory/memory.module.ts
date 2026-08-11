import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { QdrantClient } from "@qdrant/js-client-rest";
import { PrismaModule } from "../prisma/prisma.module";
import { AgentMemoryService } from "./agent-memory.service";
import {
  DeterministicEmbeddingProvider,
  EMBEDDING_PROVIDER,
  GeminiEmbeddingProvider
} from "./embedding.provider";
import { InMemoryVectorStore } from "./in-memory-vector.store";
import { QdrantVectorStore } from "./qdrant-vector.store";
import { VECTOR_STORE } from "./vector-store";

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    AgentMemoryService,
    DeterministicEmbeddingProvider,
    GeminiEmbeddingProvider,
    InMemoryVectorStore,
    {
      provide: EMBEDDING_PROVIDER,
      inject: [ConfigService, DeterministicEmbeddingProvider, GeminiEmbeddingProvider],
      useFactory: (
        config: ConfigService,
        deterministic: DeterministicEmbeddingProvider,
        gemini: GeminiEmbeddingProvider
      ) => {
        const provider = config.get<string>("EMBEDDING_PROVIDER", "deterministic");
        if (provider === "gemini") return gemini;
        if (provider === "deterministic") return deterministic;
        throw new Error(`Unsupported EMBEDDING_PROVIDER: ${provider}`);
      }
    },
    {
      provide: VECTOR_STORE,
      inject: [ConfigService, InMemoryVectorStore, EMBEDDING_PROVIDER],
      useFactory: (config: ConfigService, inMemory: InMemoryVectorStore, embeddings: { dimensions: number }) => {
        if (config.get<string>("VECTOR_STORE", "in-memory") !== "qdrant") return inMemory;
        return new QdrantVectorStore(
          new QdrantClient({ url: config.get<string>("QDRANT_URL", "http://localhost:6333") }),
          config.get<string>("QDRANT_COLLECTION", "agent_memory_semantic_v1"),
          embeddings.dimensions
        );
      }
    }
  ],
  // Other modules use the same scoped embedding and vector infrastructure.
  exports: [AgentMemoryService, EMBEDDING_PROVIDER, VECTOR_STORE]
})
export class MemoryModule {}
