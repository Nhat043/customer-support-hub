import { createHash } from "node:crypto";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenAI } from "@google/genai";

export const DETERMINISTIC_EMBEDDING_DIMENSIONS = 64;
export const DEFAULT_GEMINI_EMBEDDING_DIMENSIONS = 768;

export type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export interface EmbeddingProvider {
  readonly dimensions: number;
  embed(text: string, taskType?: EmbeddingTaskType): Promise<number[]>;
}

export const EMBEDDING_PROVIDER = Symbol("EMBEDDING_PROVIDER");

@Injectable()
export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = DETERMINISTIC_EMBEDDING_DIMENSIONS;

  async embed(text: string): Promise<number[]> {
    const values: number[] = [];
    let counter = 0;
    while (values.length < this.dimensions) {
      const digest = createHash("sha256").update(`${counter}:${text.trim().toLowerCase()}`).digest();
      for (const byte of digest) {
        values.push((byte - 127.5) / 127.5);
        if (values.length === this.dimensions) break;
      }
      counter += 1;
    }
    const magnitude = Math.sqrt(values.reduce((total, value) => total + value * value, 0)) || 1;
    return values.map((value) => value / magnitude);
  }
}

@Injectable()
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number;

  constructor(private readonly config: ConfigService) {
    const configuredDimensions = Number(
      this.config.get<string>("EMBEDDING_DIMENSIONS", String(DEFAULT_GEMINI_EMBEDDING_DIMENSIONS))
    );
    this.dimensions = Number.isInteger(configuredDimensions) && configuredDimensions > 0
      ? configuredDimensions
      : DEFAULT_GEMINI_EMBEDDING_DIMENSIONS;
  }

  async embed(text: string, taskType: EmbeddingTaskType = "RETRIEVAL_DOCUMENT"): Promise<number[]> {
    const apiKey = this.config.get<string>("GEMINI_API_KEY");
    if (!apiKey) throw new ServiceUnavailableException("Gemini embeddings are not configured");

    const useVertex = this.config.get<string>("GEMINI_USE_VERTEX_AI", "false") === "true";
    const client = new GoogleGenAI({
      apiKey,
      vertexai: useVertex,
      ...(useVertex
        ? {
            project: this.config.get<string>("GOOGLE_CLOUD_PROJECT"),
            location: this.config.get<string>("GOOGLE_CLOUD_LOCATION", "global")
          }
        : {})
    });
    const response = await client.models.embedContent({
      model: this.config.get<string>("EMBEDDING_MODEL", "gemini-embedding-001"),
      contents: text,
      config: {
        outputDimensionality: this.dimensions,
        taskType
      }
    });
    const values = response.embeddings?.[0]?.values;
    if (!values || values.length !== this.dimensions) {
      throw new ServiceUnavailableException(
        `Gemini returned an invalid embedding dimension (expected ${this.dimensions})`
      );
    }
    return values;
  }
}
