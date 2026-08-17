import { BadRequestException, ConflictException, Injectable, Inject, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { EMBEDDING_PROVIDER, EmbeddingProvider } from "../../infrastructure/memory/embedding.provider";
import { VECTOR_STORE, VectorStore } from "../../infrastructure/memory/vector-store";

const MAX_CHUNKS_PER_DOCUMENT = 160;
const CHUNK_SIZE = 1_200;
const CHUNK_OVERLAP = 180;

export type KnowledgeCitation = {
  chunkId: string;
  documentId: string;
  title: string;
  fileName: string;
  excerpt: string;
  score: number;
};

export type IndexKnowledgeDocumentInput = {
  fileName: string;
  title?: string;
  content: string;
};

@Injectable()
export class WorkspaceKnowledgeService {
  private readonly logger = new Logger(WorkspaceKnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMBEDDING_PROVIDER) private readonly embeddings: EmbeddingProvider,
    @Inject(VECTOR_STORE) private readonly vectorStore: VectorStore
  ) {}

  async list(organizationId: string, workspaceId?: string) {
    const resolvedWorkspaceId = await this.resolveWorkspaceId(organizationId, workspaceId);
    return this.prisma.knowledgeDocument.findMany({
      where: { organizationId, workspaceId: resolvedWorkspaceId },
      select: {
        id: true,
        title: true,
        fileName: true,
        status: true,
        chunkCount: true,
        createdAt: true,
        updatedAt: true,
        uploadedBy: { select: { fullName: true, email: true } }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async upload(organizationId: string, workspaceId: string | undefined, uploadedById: string, dto: IndexKnowledgeDocumentInput) {
    const resolvedWorkspaceId = await this.resolveWorkspaceId(organizationId, workspaceId);
    const content = normalizeText(dto.content);
    if (!content) throw new BadRequestException("Knowledge document content cannot be blank");
    const chunks = chunkMarkdown(content);
    if (chunks.length > MAX_CHUNKS_PER_DOCUMENT) {
      throw new ConflictException(`Knowledge document exceeds the ${MAX_CHUNKS_PER_DOCUMENT}-chunk limit`);
    }
    const contentHash = createHash("sha256").update(content).digest("hex");
    const duplicate = await this.prisma.knowledgeDocument.findFirst({
      where: { organizationId, workspaceId: resolvedWorkspaceId, contentHash },
      select: { id: true, title: true }
    });
    if (duplicate) {
      throw new ConflictException(`This workspace already has the same knowledge document: ${duplicate.title}`);
    }

    const title = dto.title?.trim() || titleFromFileName(dto.fileName);
    const document = await this.prisma.knowledgeDocument.create({
      data: {
        organizationId,
        workspaceId: resolvedWorkspaceId,
        uploadedById,
        title,
        fileName: dto.fileName.trim(),
        contentHash,
        status: "INDEXING",
        chunkCount: chunks.length
      },
      select: { id: true, title: true, fileName: true }
    });
    const records = chunks.map((content, ordinal) => ({
      id: randomUUID(),
      documentId: document.id,
      organizationId,
      workspaceId: resolvedWorkspaceId,
      ordinal,
      content,
      embeddingRef: `${this.vectorStore.name}:${document.id}:${ordinal}`
    }));
    await this.prisma.knowledgeChunk.createMany({ data: records });

    await this.index(document, organizationId, resolvedWorkspaceId, records);
    return { ...document, status: "READY" as const, chunkCount: records.length };
  }

  async getDocument(organizationId: string, workspaceId: string | undefined, documentId: string) {
    const resolvedWorkspaceId = await this.resolveWorkspaceId(organizationId, workspaceId);
    const document = await this.prisma.knowledgeDocument.findFirst({
      where: { id: documentId, organizationId, workspaceId: resolvedWorkspaceId },
      select: {
        id: true,
        title: true,
        fileName: true,
        status: true,
        chunkCount: true,
        createdAt: true,
        updatedAt: true,
        uploadedBy: { select: { fullName: true, email: true } },
        chunks: { select: { id: true, ordinal: true, content: true, createdAt: true }, orderBy: { ordinal: "asc" } }
      }
    });
    if (!document) throw new NotFoundException("Knowledge document not found");
    return document;
  }

  async retry(organizationId: string, workspaceId: string | undefined, documentId: string) {
    const resolvedWorkspaceId = await this.resolveWorkspaceId(organizationId, workspaceId);
    const document = await this.prisma.knowledgeDocument.findFirst({
      where: { id: documentId, organizationId, workspaceId: resolvedWorkspaceId },
      select: {
        id: true,
        title: true,
        fileName: true,
        status: true,
        chunkCount: true,
        chunks: { select: { id: true, content: true, ordinal: true, embeddingRef: true } }
      }
    });
    if (!document) throw new NotFoundException("Knowledge document not found");
    if (document.status !== "FAILED") {
      throw new ConflictException("Only a failed knowledge document can be retried");
    }
    if (document.chunks.length === 0) {
      throw new ConflictException("This knowledge document has no chunks to index");
    }

    await this.vectorStore.delete(document.chunks.map((chunk) => chunk.id)).catch(() => undefined);
    await this.prisma.knowledgeDocument.update({ where: { id: document.id }, data: { status: "INDEXING" } });
    await this.index(document, organizationId, resolvedWorkspaceId, document.chunks);
    return { id: document.id, title: document.title, fileName: document.fileName, status: "READY" as const, chunkCount: document.chunkCount };
  }

  async remove(organizationId: string, workspaceId: string | undefined, documentId: string) {
    const resolvedWorkspaceId = await this.resolveWorkspaceId(organizationId, workspaceId);
    const document = await this.prisma.knowledgeDocument.findFirst({
      where: { id: documentId, organizationId, workspaceId: resolvedWorkspaceId },
      select: { id: true, chunks: { select: { id: true } } }
    });
    if (!document) throw new NotFoundException("Knowledge document not found");
    await this.vectorStore.delete(document.chunks.map((chunk) => chunk.id));
    await this.prisma.knowledgeDocument.delete({ where: { id: document.id } });
    return { deleted: true, documentId: document.id };
  }

  async retrieve(organizationId: string, workspaceId: string | undefined, query: string, limit = 4): Promise<KnowledgeCitation[]> {
    if (!workspaceId) return [];
    try {
      const vector = await this.embeddings.embed(query, "RETRIEVAL_QUERY");
      const matches = await this.vectorStore.search(vector, {
        organizationId,
        workspaceId,
        sourceType: "knowledge"
      }, limit);
      if (matches.length === 0) return [];

      const chunks = await this.prisma.knowledgeChunk.findMany({
        where: {
          id: { in: matches.map((match) => match.id) },
          organizationId,
          workspaceId,
          document: { status: "READY" }
        },
        select: {
          id: true,
          content: true,
          document: { select: { id: true, title: true, fileName: true } }
        }
      });
      const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
      return matches.flatMap((match) => {
        const chunk = byId.get(match.id);
        if (!chunk) return [];
        return [{
          chunkId: chunk.id,
          documentId: chunk.document.id,
          title: chunk.document.title,
          fileName: chunk.document.fileName,
          excerpt: excerpt(chunk.content),
          score: match.score
        }];
      });
    } catch (error) {
      this.logger.warn(`Knowledge retrieval skipped: ${error instanceof Error ? error.message : "unknown error"}`);
      return [];
    }
  }

  private async resolveWorkspaceId(organizationId: string, workspaceId?: string) {
    const workspace = await this.prisma.workspace.findFirst({
      where: { organizationId, status: "ACTIVE", ...(workspaceId ? { id: workspaceId } : {}) },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    });
    if (!workspace) throw new NotFoundException("Active workspace not found");
    return workspace.id;
  }

  private async index(
    document: { id: string },
    organizationId: string,
    workspaceId: string,
    chunks: Array<{ id: string; content: string }>
  ) {
    try {
      for (const chunk of chunks) {
        const vector = await this.embeddings.embed(chunk.content, "RETRIEVAL_DOCUMENT");
        await this.vectorStore.upsert({
          id: chunk.id,
          organizationId,
          workspaceId,
          vector,
          text: chunk.content,
          sourceType: "knowledge",
          sourceId: document.id
        });
      }
      await this.prisma.knowledgeDocument.update({ where: { id: document.id }, data: { status: "READY" } });
    } catch (error) {
      await this.vectorStore.delete(chunks.map((chunk) => chunk.id)).catch(() => undefined);
      await this.prisma.knowledgeDocument.update({ where: { id: document.id }, data: { status: "FAILED" } });
      this.logger.error(`Knowledge indexing failed for ${document.id}: ${error instanceof Error ? error.message : "unknown error"}`);
      throw new ServiceUnavailableException("Knowledge document could not be indexed. Retry it after the embedding service recovers.");
    }
  }
}

export function chunkMarkdown(value: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const normalized = normalizeText(value);
  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    const maxEnd = Math.min(start + size, normalized.length);
    let end = maxEnd;
    if (maxEnd < normalized.length) {
      const preferredBreak = normalized.lastIndexOf("\n", maxEnd);
      if (preferredBreak > start + Math.floor(size / 2)) end = preferredBreak;
    }
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;
    start = Math.max(end - overlap, start + 1);
    while (normalized[start] === "\n" || normalized[start] === " ") start += 1;
  }

  return chunks;
}

function normalizeText(value: string) {
  return value.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
}

function titleFromFileName(fileName: string) {
  return fileName.trim().replace(/\.(md|pdf|docx)$/i, "").replace(/[-_]+/g, " ").trim() || "Workspace knowledge";
}

function excerpt(value: string) {
  return value.replace(/\s+/g, " ").slice(0, 280);
}
