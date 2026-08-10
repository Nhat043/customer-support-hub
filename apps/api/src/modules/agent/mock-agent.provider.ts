import { Injectable } from "@nestjs/common";
import {
  AgentProvider,
  AgentProviderDecision,
  AgentProviderInput
} from "./agent.provider";

@Injectable()
export class MockAgentProvider implements AgentProvider {
  async complete(input: AgentProviderInput): Promise<AgentProviderDecision> {
    const message = input.message.trim();
    if (/(?:summary|overview|tổng quan|bao nhiêu).*(?:request|yêu cầu|support)?/i.test(message)) {
      return { text: "I will calculate the current support queue summary.", toolCall: { name: "get_support_queue_summary", arguments: {} } };
    }
    if (/(?:open|go to|mở|đi tới).*(?:request|queue|yêu cầu)/i.test(message)) {
      return { text: "I will open the customer request queue.", toolCall: { name: "navigate_to", arguments: { target: "requests" } } };
    }
    if (/(?:new|mới).*(?:request|yêu cầu)/i.test(message)) {
      return { text: "I will look for new customer requests.", toolCall: { name: "list_workflow_items", arguments: { status: "NEW" } } };
    }
    const createMatch = message.match(/^(?:create|tạo)\s+(?:workflow|task|item)\s*:\s*(.+)$/i);
    if (createMatch) {
      return {
        text: "I will create that workflow item.",
        toolCall: {
          name: "create_workflow_item",
          arguments: { title: createMatch[1]!.trim() }
        }
      };
    }

    if (/^(?:list|show|liệt kê)\s+(?:workflow|tasks?|items?)/i.test(message)) {
      return {
        text: "I will list the workflow items in the selected tenant context.",
        toolCall: { name: "list_workflow_items", arguments: {} }
      };
    }

    const statusMatch = message.match(
      /^(?:status|set status|đổi trạng thái)\s+([0-9a-f-]{36})\s+(NEW|TRIAGE|IN_PROGRESS|WAITING|RESOLVED|CLOSED)$/i
    );
    if (statusMatch) {
      return {
        text: "I will update that workflow item.",
        toolCall: {
          name: "update_workflow_status",
          arguments: { workflowItemId: statusMatch[1]!, status: statusMatch[2]!.toUpperCase() }
        }
      };
    }

    const commentMatch = message.match(
      /^(?:comment|add comment|bình luận)\s+([0-9a-f-]{36})\s*:\s*(.+)$/i
    );
    if (commentMatch) {
      return {
        text: "I will add that comment.",
        toolCall: {
          name: "add_comment",
          arguments: { workflowItemId: commentMatch[1]!, body: commentMatch[2]!.trim() }
        }
      };
    }

    return {
      text: `Mock agent received: ${message}. Try "list workflow" or "create task: <title>".`
    };
  }

  async continueAfterTool(
    _input: AgentProviderInput,
    previous: AgentProviderDecision,
    toolResult: Record<string, unknown>
  ): Promise<AgentProviderDecision> {
    const count = typeof toolResult.count === "number" ? toolResult.count : undefined;
    if (previous.toolCall?.name === "list_workflow_items" && count !== undefined) {
      return { text: `I found ${count} matching customer request${count === 1 ? "" : "s"}.` };
    }
    if (previous.toolCall?.name === "get_support_queue_summary") {
      return {
        text: `There are ${toolResult.newCount ?? 0} new, ${toolResult.overdueCount ?? 0} overdue, and ${toolResult.unassignedCount ?? 0} unassigned customer requests.`
      };
    }
    return { text: "The requested workspace action was completed through the approved tool." };
  }
}
