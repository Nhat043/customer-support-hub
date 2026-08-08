import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { QdrantClient } from "@qdrant/js-client-rest";
import { PrismaModule } from "../prisma/prisma.module";
import { AgentMemoryService } from "./agent-memory.service";
import { DeterministicEmbeddingProvider, EMBEDDING_PROVIDER } from "./embedding.provider";
import { InMemoryVectorStore } from "./in-memory-vector.store";
import { QdrantVectorStore } from "./qdrant-vector.store";
import { VECTOR_STORE } from "./vector-store";

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    AgentMemoryService,
    DeterministicEmbeddingProvider,
    InMemoryVectorStore,
    {
      provide: EMBEDDING_PROVIDER,
      useExisting: DeterministicEmbeddingProvider
    },
    {
      provide: VECTOR_STORE,
      inject: [ConfigService, InMemoryVectorStore],
      useFactory: (config: ConfigService, inMemory: InMemoryVectorStore) => {
        if (config.get<string>("VECTOR_STORE", "in-memory") !== "qdrant") return inMemory;
        return new QdrantVectorStore(
          new QdrantClient({ url: config.get<string>("QDRANT_URL", "http://localhost:6333") }),
          config.get<string>("QDRANT_COLLECTION", "agent_memory")
        );
      }
    }
  ],
  exports: [AgentMemoryService]
})
export class MemoryModule {}
