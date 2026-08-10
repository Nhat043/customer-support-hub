"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { API_ORIGIN } from "@/lib/api";
import { getSession } from "@/lib/auth";

type ChatMessage = { role: "user" | "assistant"; text: string };
type UiAction = {
  type: "navigate";
  target: "dashboard" | "requests" | "request_detail";
  label: string;
  workflowItemId?: string;
  filters?: { status?: string; priority?: string; query?: string };
};

export function AgentDrawer({ orgSlug, onClose }: { orgSlug: string; onClose: () => void }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Ready to help");
  const [error, setError] = useState("");
  const [uiAction, setUiAction] = useState<UiAction | null>(null);

  function navigate(action: UiAction) {
    if (action.target === "dashboard") router.push(`/orgs/${orgSlug}/dashboard`);
    if (action.target === "requests") {
      const params = new URLSearchParams();
      if (action.filters?.status) params.set("status", action.filters.status);
      if (action.filters?.priority) params.set("priority", action.filters.priority);
      if (action.filters?.query) params.set("q", action.filters.query);
      router.push(`/orgs/${orgSlug}/workflow-items${params.size ? `?${params.toString()}` : ""}`);
    }
    if (action.target === "request_detail" && action.workflowItemId) {
      router.push(`/orgs/${orgSlug}/workflow-items/${action.workflowItemId}`);
    }
    onClose();
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const session = getSession();
    const text = message.trim();
    if (!session || !text || loading) return;

    setError("");
    setUiAction(null);
    setLoading(true);
    setStatus("Starting secure agent run");
    setMessages((current) => [...current, { role: "user", text }]);
    setMessage("");
    try {
      await new Promise<void>((resolve, reject) => {
        const socket: Socket = io(`${API_ORIGIN}/agent`, {
          auth: { accessToken: session.accessToken },
          transports: ["websocket"]
        });
        const cleanup = () => socket.disconnect();
        socket.on("connect_error", (socketError) => {
          cleanup();
          reject(socketError);
        });
        socket.on("run.started", () => setStatus("Thinking with tenant context"));
        socket.on("tool.called", (tool: { name: string }) => setStatus(`Using ${tool.name.replaceAll("_", " ")}`));
        socket.on("tool.result", () => setStatus("Validating tool result"));
        socket.on("run.completed", (result: { output: string; uiAction?: UiAction | null }) => {
          setMessages((current) => [...current, { role: "assistant", text: result.output }]);
          setUiAction(result.uiAction ?? null);
          setStatus("Completed");
          cleanup();
          resolve();
        });
        socket.on("run.failed", (result: { message: string }) => {
          cleanup();
          reject(new Error(result.message));
        });
        socket.emit("agent.run", {
          orgSlug,
          message: text,
          idempotencyKey: crypto.randomUUID()
        });
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The assistant could not complete this request.");
      setStatus("Unavailable");
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="agent-drawer" aria-label="AI support assistant">
      <div className="agent-drawer-header">
        <div>
          <span className="badge">AI assistant</span>
          <h2>Support copilot</h2>
          <p className="muted">Uses approved tools, tenant-scoped data, and workspace knowledge.</p>
        </div>
        <button className="btn secondary compact" type="button" onClick={onClose}>Close</button>
      </div>

      <div className="agent-message-list" aria-live="polite">
        {messages.length === 0 ? (
          <div className="agent-empty-state">
            <strong>Try an operational question</strong>
            <p>“Are there any new requests?”</p>
            <p>“Give me a queue summary”</p>
            <p>“Open the new requests”</p>
          </div>
        ) : messages.map((item, index) => (
          <article className={`agent-message ${item.role}`} key={`${item.role}-${index}`}>
            <strong>{item.role === "user" ? "You" : "Assistant"}</strong>
            <p>{item.text}</p>
          </article>
        ))}
      </div>

      {uiAction ? (
        <button className="btn secondary agent-action" type="button" onClick={() => navigate(uiAction)}>
          {uiAction.label}
        </button>
      ) : null}
      <p className="agent-status">{loading ? status : status === "Ready to help" ? "Data access is limited to approved functions." : status}</p>
      {error ? <p className="error">{error}</p> : null}
      <form className="agent-composer" onSubmit={send}>
        <textarea
          className="textarea"
          rows={3}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Ask about requests, queue status, or where to go..."
        />
        <button className="btn primary" type="submit" disabled={loading || !message.trim()}>
          {loading ? "Working..." : "Send"}
        </button>
      </form>
    </aside>
  );
}
