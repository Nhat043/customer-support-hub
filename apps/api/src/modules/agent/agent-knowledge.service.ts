import { Injectable, Logger } from "@nestjs/common";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

@Injectable()
export class AgentKnowledgeService {
  private readonly logger = new Logger(AgentKnowledgeService.name);
  private readonly fallback = "Use tools for all workspace data. Never invent IDs, records, or SQL.";
  private cachedKnowledge?: string;

  getBaseKnowledge() {
    if (this.cachedKnowledge) return this.cachedKnowledge;

    const candidates = [
      resolve(process.cwd(), "knowledge/customer-support-hub.md"),
      resolve(process.cwd(), "apps/api/knowledge/customer-support-hub.md")
    ];
    const path = candidates.find((candidate) => existsSync(candidate));
    if (!path) {
      this.logger.warn("Agent knowledge base was not found; using the safe fallback instructions");
      return this.fallback;
    }

    this.cachedKnowledge = readFileSync(path, "utf8").trim() || this.fallback;
    return this.cachedKnowledge;
  }
}
