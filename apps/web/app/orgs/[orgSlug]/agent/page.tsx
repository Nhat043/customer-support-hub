"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { apiFetch, API_ORIGIN } from "@/lib/api";
import { getSession } from "@/lib/auth";

type Workspace = { id: string; slug: string; name: string };
type ChatMessage = { role: "user" | "assistant"; text: string };
type AgentRun = { id: string; status: string; inputSummary: string | null; outputSummary: string | null; startedAt: string };

export default function AgentPage() {
  const params = useParams<{ orgSlug: string }>();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<AgentRun[]>([]);
  const [liveStatus, setLiveStatus] = useState("");

  useEffect(() => {
    const session = getSession();
    if (!session || !params.orgSlug) return;
    void Promise.all([
      apiFetch<Workspace[]>(`/orgs/${params.orgSlug}/workspaces`, { accessToken: session.accessToken }),
      apiFetch<AgentRun[]>(`/orgs/${params.orgSlug}/agent/runs`, { accessToken: session.accessToken })
    ]).then(([loadedWorkspaces, loadedHistory]) => {
      setWorkspaces(loadedWorkspaces);
      setHistory(loadedHistory);
    }).catch(() => setError("Could not load agent data"));
  }, [params.orgSlug]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const session = getSession();
    const text = message.trim();
    if (!session || !text || loading) return;
    setError("");
    setLoading(true);
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
        socket.on("run.started", () => setLiveStatus("Run started"));
        socket.on("tool.called", (event: { name: string }) => setLiveStatus(`Calling ${event.name}`));
        socket.on("tool.result", () => setLiveStatus("Tool result received"));
        socket.on("run.completed", (event: { output: string }) => {
          setMessages((current) => [...current, { role: "assistant", text: event.output }]);
          setLiveStatus("Run completed");
          cleanup();
          resolve();
        });
        socket.on("run.failed", (event: { message: string }) => {
          cleanup();
          reject(new Error(event.message));
        });
        socket.emit("agent.run", {
          orgSlug: params.orgSlug,
          message: text,
          workspaceId: workspaceId || undefined,
          idempotencyKey: crypto.randomUUID()
        });
      });
      const refreshedHistory = await apiFetch<AgentRun[]>(`/orgs/${params.orgSlug}/agent/runs`, { accessToken: session.accessToken });
      setHistory(refreshedHistory);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Agent request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="grid two">
      <div className="card">
        <span className="badge">AI agent</span>
        <h2>Workflow assistant</h2>
        <p className="muted">
          This local mock provider demonstrates function calling without an API key.
        </p>
        <div className="list" style={{ minHeight: 260 }}>
          {messages.length === 0 ? (
            <div className="muted">Try: create task: Review onboarding flow</div>
          ) : null}
          {messages.map((item, index) => (
            <div className="card" key={`${item.role}-${index}`}>
              <strong>{item.role === "user" ? "I" : "Agent"}</strong>
              <p style={{ whiteSpace: "pre-wrap" }}>{item.text}</p>
            </div>
          ))}
        </div>
        <form className="list" style={{ marginTop: 18 }} onSubmit={send}>
          <select className="select" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
            <option value="">All workspaces</option>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
            ))}
          </select>
          <textarea
            className="input"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="create task: ..."
            rows={3}
          />
          <button className="btn" type="submit" disabled={loading || !message.trim()}>
            {loading ? "Running..." : "Run agent"}
          </button>
        </form>
        {error ? <p className="error">{error}</p> : null}
      </div>
      <aside className="card">
        <h3>Available function calls</h3>
        <div className="list">
          <div className="card"><strong>list_workflow_items</strong><p className="muted">List items in the selected tenant/workspace.</p></div>
          <div className="card"><strong>create_workflow_item</strong><p className="muted">Create an item and its CREATED event.</p></div>
          <div className="card"><strong>update_workflow_status</strong><p className="muted">Update only an item owned by the tenant context.</p></div>
          <div className="card"><strong>add_comment</strong><p className="muted">Add a tenant-scoped comment and event.</p></div>
        </div>
        <h3>Recent runs</h3>
        <div className="list">
          {history.length === 0 ? <p className="muted">No agent runs yet.</p> : null}
          {history.slice(0, 8).map((run) => (
            <div className="card" key={run.id}>
              <strong>{run.status}</strong>
              <p className="muted">{run.inputSummary}</p>
              <small>{new Date(run.startedAt).toLocaleString()}</small>
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
}
