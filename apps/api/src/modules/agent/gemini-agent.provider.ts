import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenAI } from "@google/genai";
import { AgentProvider, AgentProviderDecision, AgentProviderInput } from "./agent.provider";
import { AgentKnowledgeService } from "./agent-knowledge.service";

const functionDeclarations = [
  { name: "list_workflow_items", description: "Search customer requests in the current tenant. Use this for questions about new, waiting, high-priority, or matching requests.", parametersJsonSchema: { type: "object", properties: { status: { type: "string", enum: ["NEW", "TRIAGE", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"] }, priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] }, query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50 } } } },
  { name: "get_support_queue_summary", description: "Calculate open request counts, status breakdown, new, overdue, unassigned, and high-priority counts for the current tenant.", parametersJsonSchema: { type: "object", properties: {} } },
  { name: "navigate_to", description: "Navigate only to an allow-listed UI target. Use when the user asks to open or go to a page.", parametersJsonSchema: { type: "object", properties: { target: { type: "string", enum: ["dashboard", "requests", "request_detail"] }, workflowItemId: { type: "string" }, status: { type: "string", enum: ["NEW", "TRIAGE", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"] }, priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] } }, required: ["target"] } },
  { name: "create_workflow_item", description: "Create a customer request in the current support workspace.", parametersJsonSchema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] } },
  { name: "update_workflow_status", description: "Update a customer request status after first obtaining its ID.", parametersJsonSchema: { type: "object", properties: { workflowItemId: { type: "string" }, status: { type: "string", enum: ["NEW", "TRIAGE", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"] } }, required: ["workflowItemId", "status"] } },
  { name: "add_comment", description: "Add a support note to a customer request after first obtaining its ID.", parametersJsonSchema: { type: "object", properties: { workflowItemId: { type: "string" }, body: { type: "string" } }, required: ["workflowItemId", "body"] } }
];

@Injectable()
export class GeminiAgentProvider implements AgentProvider {
  constructor(
    private readonly config: ConfigService,
    private readonly knowledge: AgentKnowledgeService
  ) {}

  async complete(input: AgentProviderInput): Promise<AgentProviderDecision> {
    const apiKey = this.config.get<string>("GEMINI_API_KEY");
    if (!apiKey) throw new ServiceUnavailableException("Gemini is not configured");
    // API keys use the Gemini Developer API. Vertex AI instead uses OAuth/ADC.
    const useVertex = this.config.get<string>("GEMINI_USE_VERTEX_AI", "false") === "true";
    const client = new GoogleGenAI({
      apiKey,
      vertexai: useVertex,
      ...(useVertex ? { project: this.config.get<string>("GOOGLE_CLOUD_PROJECT"), location: this.config.get<string>("GOOGLE_CLOUD_LOCATION", "global") } : {})
    });
    const memory = input.memory.length ? input.memory.map((entry) => `- ${entry.text}`).join("\n") : "No prior memory.";
    const chat = client.chats.create({
      model: input.modelName,
      config: {
        systemInstruction: `You are a customer support workspace assistant. Follow this knowledge base exactly:\n${this.knowledge.getBaseKnowledge()}\n\nTenant memory:\n${memory}`,
        tools: [{ functionDeclarations }]
      }
    });
    const response = await chat.sendMessage({ message: input.message });
    return this.toDecision(response, chat);
  }

  async continueAfterTool(
    _input: AgentProviderInput,
    previous: AgentProviderDecision,
    toolResult: Record<string, unknown>
  ): Promise<AgentProviderDecision> {
    const call = previous.toolCall;
    const chat = previous.continuation as { sendMessage: (params: { message: unknown }) => Promise<unknown> } | undefined;
    if (!call || !chat) {
      throw new ServiceUnavailableException("Gemini continuation context is unavailable");
    }
    const response = await chat.sendMessage({
      message: [{
        functionResponse: {
          ...(call.id ? { id: call.id } : {}),
          name: call.name,
          response: { output: toolResult }
        }
      }]
    });
    return this.toDecision(response as { functionCalls?: Array<{ id?: string; name?: string; args?: Record<string, unknown> }>; text?: string }, chat);
  }

  private toDecision(
    response: { functionCalls?: Array<{ id?: string; name?: string; args?: Record<string, unknown> }>; text?: string },
    continuation: unknown
  ): AgentProviderDecision {
    const call = response.functionCalls?.[0];
    const toolCall = call?.name
      ? { id: call.id, name: call.name, arguments: (call.args ?? {}) as Record<string, unknown> }
      : undefined;
    return {
      text: response.text?.trim() || (toolCall ? `I will ${toolCall.name.replaceAll("_", " ")}.` : "I could not produce a response."),
      toolCall,
      continuation
    };
  }
}
