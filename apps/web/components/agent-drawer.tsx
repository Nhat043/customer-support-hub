"use client";

import { FormEvent, KeyboardEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { apiFetch, API_ORIGIN } from "@/lib/api";
import { getSession } from "@/lib/auth";

type ChatMessage = { id?: string; role: "user" | "assistant"; text: string; createdAt?: string };
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
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [status, setStatus] = useState("Ready to help");
  const [error, setError] = useState("");
  const [uiAction, setUiAction] = useState<UiAction | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      setLoadingHistory(false);
      return;
    }
    let active = true;
    setLoadingHistory(true);

    void apiFetch<ChatMessage[]>(`/orgs/${orgSlug}/agent/conversation`, {
      accessToken: session.accessToken
    }).then((history) => {
      if (active) setMessages(history);
    }).catch(() => {
      if (active) setError("Could not load your previous assistant conversation.");
    }).finally(() => {
      if (active) setLoadingHistory(false);
    });

    return () => { active = false; };
  }, [orgSlug]);

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

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const session = getSession();
    const text = message.trim();
    if (!session || !text || loading || loadingHistory) return;

    setError("");
    setUiAction(null);
    setLoading(true);
    setStatus("Starting secure agent run");
    setMessages((current) => [...current, { role: "user", text, createdAt: new Date().toISOString() }]);
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
          setMessages((current) => [...current, { role: "assistant", text: result.output, createdAt: new Date().toISOString() }]);
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
        {loadingHistory ? <p className="muted">Loading your private conversation...</p> : null}
        {!loadingHistory && messages.length === 0 ? (
          <div className="agent-empty-state">
            <strong>Try an operational question</strong>
            <p>“Are there any new requests?”</p>
            <p>“Give me a queue summary”</p>
            <p>“Open the new requests”</p>
          </div>
        ) : null}
        {messages.map((item, index) => (
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
        <div className="agent-composer-input">
          <textarea
            className="textarea"
            rows={3}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Ask about requests, queue status, or where to go..."
          />
          <span className="agent-composer-hint">Enter to send · Shift+Enter for a new line</span>
        </div>
        <button className="btn primary" type="submit" disabled={loading || loadingHistory || !message.trim()}>
          {loading ? "Working..." : loadingHistory ? "Loading..." : "Send"}
        </button>
      </form>
    </aside>
  );
}
