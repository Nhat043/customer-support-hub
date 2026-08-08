import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";

export const EMBEDDING_DIMENSIONS = 64;

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

export const EMBEDDING_PROVIDER = Symbol("EMBEDDING_PROVIDER");

@Injectable()
export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    const values: number[] = [];
    let counter = 0;
    while (values.length < EMBEDDING_DIMENSIONS) {
      const digest = createHash("sha256").update(`${counter}:${text.trim().toLowerCase()}`).digest();
      for (const byte of digest) {
        values.push((byte - 127.5) / 127.5);
        if (values.length === EMBEDDING_DIMENSIONS) break;
      }
      counter += 1;
    }
    const magnitude = Math.sqrt(values.reduce((total, value) => total + value * value, 0)) || 1;
    return values.map((value) => value / magnitude);
  }
}
