"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";

type WorkflowItem = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  createdAt: string;
};

const statuses = ["NEW", "TRIAGE", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"];

export default function WorkflowItemsPage() {
  const params = useParams<{ orgSlug: string }>();
  const [orgSlug, setOrgSlug] = useState("demo");
  const [items, setItems] = useState<WorkflowItem[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canEdit = getSession()?.activeMembershipRole !== "VIEWER";

  useEffect(() => {
    setOrgSlug(params.orgSlug ?? "demo");
  }, [params.orgSlug]);

  useEffect(() => {
    const session = getSession();
    if (!session) return;

    void loadItems(session.accessToken);
  }, [orgSlug]);

  async function loadItems(accessToken: string) {
    try {
      setItems(
        await apiFetch<WorkflowItem[]>(`/orgs/${orgSlug}/workflow-items`, {
          accessToken
        })
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load workflow items");
    }
  }

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const session = getSession();
    if (!session || !title.trim()) return;

    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/orgs/${orgSlug}/workflow-items`, {
        method: "POST",
        accessToken: session.accessToken,
        body: JSON.stringify({ title: title.trim(), description: description.trim() || undefined })
      });
      setTitle("");
      setDescription("");
      await loadItems(session.accessToken);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create item");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(itemId: string, status: string) {
    const session = getSession();
    if (!session) return;

    setError(null);
    try {
      await apiFetch(`/orgs/${orgSlug}/workflow-items/${itemId}`, {
        method: "PATCH",
        accessToken: session.accessToken,
        body: JSON.stringify({ status })
      });
      await loadItems(session.accessToken);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update item");
    }
  }

  return (
    <section className="grid two">
      <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="badge">Workflow items</div>
          <h2>{orgSlug}</h2>
        </div>
      </div>

      {canEdit ? <form className="card grid" onSubmit={createItem} style={{ marginTop: 20 }}>
        <div>
          <div className="badge">New customer request</div>
          <h3 style={{ marginBottom: 0 }}>Add a request</h3>
        </div>
        <input
          className="input"
          placeholder="Customer request title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          minLength={2}
          required
        />
        <textarea
          className="textarea"
          placeholder="Customer details or issue"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <button className="btn primary" disabled={loading} type="submit">
          {loading ? "Creating..." : "Create request"}
        </button>
      </form> : null}

      {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}

      <div className="list">
        {items.map((item) => (
          <article key={item.id} className="card">
            <Link href={`/orgs/${orgSlug}/workflow-items/${item.id}`}>
              <strong>{item.title}</strong>
            </Link>
            <p className="muted">{item.description ?? "No description"}</p>
            <div className="row">
              {canEdit ? <select
                className="select"
                value={item.status}
                onChange={(event) => void updateStatus(item.id, event.target.value)}
                style={{ maxWidth: 180 }}
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select> : <span className="badge">{item.status}</span>}
              <span className="badge">{item.priority}</span>
            </div>
          </article>
        ))}
      </div>
      </div>
      <aside className="card">
        <div className="badge">Customer request queue</div>
        <h3>Shared team context</h3>
        <p className="muted">
          Requests are shared only with people in this company workspace. Your role controls
          whether you can read, create, or update them.
        </p>
        <p className="muted">Items loaded: {items.length}</p>
      </aside>
    </section>
  );
}
