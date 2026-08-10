export type AgentToolCall = {
  name: string;
  arguments: Record<string, unknown>;
  id?: string;
};

export type AgentUiAction = {
  type: "navigate";
  target: "dashboard" | "requests" | "request_detail";
  label: string;
  workflowItemId?: string;
  filters?: { status?: string; priority?: string; query?: string };
};

export type AgentProviderInput = {
  message: string;
  modelName: string;
  memory: Array<{ id: string; text: string; score: number; sourceType: string; sourceId?: string }>;
};

export type AgentProviderDecision = {
  text: string;
  toolCall?: AgentToolCall;
  continuation?: unknown;
};

export type AgentRunHooks = {
  onStarted?: (event: { runId: string; modelName: string }) => void | Promise<void>;
  onToolCalled?: (event: { runId: string; name: string; arguments: Record<string, unknown> }) => void | Promise<void>;
  onToolResult?: (event: { runId: string; name: string; result: Record<string, unknown> }) => void | Promise<void>;
  onCompleted?: (event: { runId: string; output: string; replayed?: boolean; uiAction?: AgentUiAction | null }) => void | Promise<void>;
  onFailed?: (event: { runId: string; message: string }) => void | Promise<void>;
};

export interface AgentProvider {
  complete(input: AgentProviderInput): Promise<AgentProviderDecision>;
  continueAfterTool?(
    input: AgentProviderInput,
    previous: AgentProviderDecision,
    toolResult: Record<string, unknown>
  ): Promise<AgentProviderDecision>;
}

export const AGENT_PROVIDER = Symbol("AGENT_PROVIDER");
