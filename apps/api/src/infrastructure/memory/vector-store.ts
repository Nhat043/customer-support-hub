export type MemoryVectorFilter = {
  organizationId: string;
  userId?: string;
  workspaceId?: string;
  sourceType?: string;
};

export type MemoryVectorPoint = MemoryVectorFilter & {
  id: string;
  vector: number[];
  text: string;
  sourceType: string;
  sourceId?: string;
};

export type MemoryVectorMatch = Omit<MemoryVectorPoint, "vector"> & { score: number };

export interface VectorStore {
  readonly name: string;
  upsert(point: MemoryVectorPoint): Promise<void>;
  search(vector: number[], filter: MemoryVectorFilter, limit: number): Promise<MemoryVectorMatch[]>;
  delete(ids: string[]): Promise<void>;
}

export const VECTOR_STORE = Symbol("VECTOR_STORE");
