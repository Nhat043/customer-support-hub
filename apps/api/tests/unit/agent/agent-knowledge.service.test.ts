import test from "node:test";
import assert from "node:assert/strict";
import { AgentKnowledgeService } from "../../../src/modules/agent/agent-knowledge.service";

test("agent knowledge service loads the shipped Customer Support Hub Markdown knowledge base", () => {
  const knowledge = new AgentKnowledgeService().getBaseKnowledge();

  assert.match(knowledge, /Customer Support Hub/);
  assert.match(knowledge, /Never generate or execute SQL/);
  assert.match(knowledge, /navigation tool/);
});
