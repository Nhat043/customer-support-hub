"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";

type WorkflowItem = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  dueAt?: string | null;
  owner?: { id: string; fullName: string; email: string } | null;
  createdAt: string;
  createdBy?: { fullName: string };
  events: Array<{ id: string; eventType: string; createdAt: string }>;
};

type Member = {
  role: string;
  user: { id: string; fullName: string; email: string };
};

function readableLabel(value: string) {
  return value.toLowerCase().split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

type Comment = {
  id: string;
  body: string;
  createdAt: string;
  authorUser?: { fullName: string } | null;
};

export default function WorkflowItemDetailPage() {
  const params = useParams<{ orgSlug: string; id: string }>();
  const [item, setItem] = useState<WorkflowItem | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [body, setBody] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [savingRouting, setSavingRouting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session || !params.orgSlug || !params.id) return;
    const currentSession = session;

    async function load() {
      try {
        const [workflowItem, workflowComments, activeMembers] = await Promise.all([
          apiFetch<WorkflowItem>(`/orgs/${params.orgSlug}/workflow-items/${params.id}`, {
            accessToken: currentSession.accessToken
          }),
          apiFetch<Comment[]>(
            `/orgs/${params.orgSlug}/workflow-items/${params.id}/comments`,
            { accessToken: currentSession.accessToken }
          ),
          apiFetch<Member[]>(`/orgs/${params.orgSlug}/members`, { accessToken: currentSession.accessToken })
        ]);
        setItem(workflowItem);
        setComments(workflowComments);
        setMembers(activeMembers);
        setOwnerId(workflowItem.owner?.id ?? "");
        setDueAt(toDateTimeLocal(workflowItem.dueAt));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load workflow item");
      }
    }

    void load();
  }, [params.id, params.orgSlug]);

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const session = getSession();
    if (!session || !body.trim()) return;

    try {
      const comment = await apiFetch<Comment>(
        `/orgs/${params.orgSlug}/workflow-items/${params.id}/comments`,
        {
          method: "POST",
          accessToken: session.accessToken,
          body: JSON.stringify({ body: body.trim() })
        }
      );
      setComments((current) => [...current, comment]);
      setBody("");
    } catch (commentError) {
      setError(commentError instanceof Error ? commentError.message : "Could not add comment");
    }
  }

  async function saveRouting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const session = getSession();
    if (!session || !item) return;
    setSavingRouting(true);
    setError(null);
    try {
      const updated = await apiFetch<WorkflowItem>(`/orgs/${params.orgSlug}/workflow-items/${params.id}`, {
        method: "PATCH",
        accessToken: session.accessToken,
        body: JSON.stringify({ ownerId: ownerId || null, dueAt: dueAt ? new Date(dueAt).toISOString() : null })
      });
      setItem((current) => current ? { ...current, ...updated, owner: members.find((member) => member.user.id === ownerId)?.user ?? null } : current);
    } catch {
      setError("Could not update the assignee or deadline. Try again.");
    } finally {
      setSavingRouting(false);
    }
  }

  if (!item) {
    return <section className="card">{error ?? "Loading workflow item..."}</section>;
  }

  return (
    <section className="grid two">
      <div className="grid">
        <section className="card">
          <Link className="muted" href={`/orgs/${params.orgSlug}/workflow-items`}>
            Back to customer requests
          </Link>
          <div className="row" style={{ marginTop: 18 }}>
            <span className="badge">{readableLabel(item.status)}</span>
            <span className="badge">{readableLabel(item.priority)} priority</span>
          </div>
          <h2>{item.title}</h2>
          <p className="muted">{item.description ?? "No details added yet."}</p>
          <p className="muted">
            Created by {item.createdBy?.fullName ?? "Unknown"} on {new Date(item.createdAt).toLocaleString()}
          </p>
        </section>

        {(["OWNER", "ADMIN"].includes(getSession()?.activeMembershipRole ?? "")) ? (
          <section className="card">
            <h3>Assignment and SLA</h3>
            <p className="muted">Assign an active teammate and set the deadline this request should meet.</p>
            <form className="grid" onSubmit={saveRouting}>
              <label className="grid">
                <span>Handled by</span>
                <select className="select" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
                  <option value="">Unassigned</option>
                  {members.map((member) => <option key={member.user.id} value={member.user.id}>{member.user.fullName} ({readableLabel(member.role)})</option>)}
                </select>
              </label>
              <label className="grid">
                <span>Deadline</span>
                <input className="input" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
              </label>
              <button className="btn primary" disabled={savingRouting} type="submit">{savingRouting ? "Saving..." : "Save assignment and deadline"}</button>
            </form>
          </section>
        ) : null}

        <section className="card">
          <h3>Activity</h3>
          <div className="list">
            {item.events.map((event) => (
              <div className="row" key={event.id}>
                <span className="badge">{event.eventType}</span>
                <span className="muted">{new Date(event.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card">
        <h3>Comments</h3>
        <div className="list">
          {comments.map((comment) => (
            <article className="card" key={comment.id}>
              <strong>{comment.authorUser?.fullName ?? "User"}</strong>
              <p>{comment.body}</p>
              <small className="muted">{new Date(comment.createdAt).toLocaleString()}</small>
            </article>
          ))}
        </div>
        <form className="grid" onSubmit={addComment} style={{ marginTop: 18 }}>
          <textarea
            className="textarea"
            placeholder="Write a comment"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
          />
          {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
          <button className="btn primary" type="submit">
            Add comment
          </button>
        </form>
      </section>
    </section>
  );
}
