"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getSession, type StoredSession } from "@/lib/auth";

type WorkflowItem = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  dueAt?: string | null;
  owner?: { id: string; fullName: string } | null;
  createdAt: string;
};

type Filters = { status: string; priority: string; query: string };

const statusOptions = [
  { value: "NEW", label: "New" },
  { value: "TRIAGE", label: "Needs review" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "WAITING", label: "Waiting for customer" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" }
];

function readableLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function WorkflowItemsContent({ orgSlug, filters }: { orgSlug: string; filters: Filters }) {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [items, setItems] = useState<WorkflowItem[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canEdit = Boolean(session && session.activeMembershipRole !== "VIEWER");
  const visibleItems = items.filter((item) =>
    (!filters.status || item.status === filters.status) &&
    (!filters.priority || item.priority === filters.priority) &&
    (!filters.query || `${item.title} ${item.description ?? ""}`.toLowerCase().includes(filters.query))
  );

  useEffect(() => {
    setSession(getSession());
  }, []);

  useEffect(() => {
    if (!session) return;
    void loadItems(session.accessToken);
  }, [orgSlug, session]);

  async function loadItems(accessToken: string) {
    try {
      setItems(await apiFetch<WorkflowItem[]>(`/orgs/${orgSlug}/workflow-items`, { accessToken }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load workflow items");
    }
  }

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
            <div className="badge">Customer requests</div>
            <h2>Support queue</h2>
            <p className="muted">Create a request, keep its status updated, and resolve it with your team.</p>
          </div>
        </div>

        {canEdit ? <form className="card grid" onSubmit={createItem} style={{ marginTop: 20 }}>
          <div><div className="badge">Step 1</div><h3 style={{ marginBottom: 0 }}>Log a customer request</h3></div>
          <input className="input" placeholder="Short summary, e.g. Customer has not received an order" value={title} onChange={(event) => setTitle(event.target.value)} minLength={2} required />
          <textarea className="textarea" placeholder="Add the customer details, issue, and information your team needs" value={description} onChange={(event) => setDescription(event.target.value)} />
          <button className="btn primary" disabled={loading} type="submit">{loading ? "Creating..." : "Add to support queue"}</button>
        </form> : null}

        {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
        {filters.status || filters.priority || filters.query ? <p className="muted">Showing {visibleItems.length} filtered request{visibleItems.length === 1 ? "" : "s"} from the assistant.</p> : null}

        <div className="list">
          {visibleItems.map((item) => (
            <article key={item.id} className="card">
              <Link href={`/orgs/${orgSlug}/workflow-items/${item.id}`}><strong>{item.title}</strong></Link>
              <p className="muted">{item.description ?? "No details added yet."}</p>
              <p className="muted">Handled by: {item.owner?.fullName ?? "Unassigned"}</p>
              <p className="muted">{item.dueAt ? `Due ${new Date(item.dueAt).toLocaleString()}${new Date(item.dueAt) < new Date() && item.status !== "CLOSED" ? " (overdue)" : ""}` : "No deadline set"}</p>
              <div className="row">
                {canEdit ? <select className="select" value={item.status} onChange={(event) => void updateStatus(item.id, event.target.value)} style={{ maxWidth: 180 }}>{statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select> : <span className="badge">{readableLabel(item.status)}</span>}
                <span className="badge">{readableLabel(item.priority)} priority</span>
              </div>
            </article>
          ))}
        </div>
      </div>
      <aside className="card">
        <div className="badge">How this works</div>
        <h3>One shared queue for your team</h3>
        <p className="muted">Add every customer issue here. Team members can update its status as they investigate, wait for the customer, resolve, or close the request.</p>
        <p className="muted">{visibleItems.length === 1 ? "1 request in this view." : `${visibleItems.length} requests in this view.`}</p>
      </aside>
    </section>
  );
}
