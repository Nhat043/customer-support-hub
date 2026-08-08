export type AgentToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

export type AgentProviderInput = {
  message: string;
  modelName: string;
  memory: Array<{ id: string; text: string; score: number; sourceType: string; sourceId?: string }>;
};

export type AgentProviderDecision = {
  text: string;
  toolCall?: AgentToolCall;
};

export type AgentRunHooks = {
  onStarted?: (event: { runId: string; modelName: string }) => void | Promise<void>;
  onToolCalled?: (event: { runId: string; name: string; arguments: Record<string, unknown> }) => void | Promise<void>;
  onToolResult?: (event: { runId: string; name: string; result: Record<string, unknown> }) => void | Promise<void>;
  onCompleted?: (event: { runId: string; output: string; replayed?: boolean }) => void | Promise<void>;
  onFailed?: (event: { runId: string; message: string }) => void | Promise<void>;
};

export interface AgentProvider {
  complete(input: AgentProviderInput): Promise<AgentProviderDecision>;
}

export const AGENT_PROVIDER = Symbol("AGENT_PROVIDER");
