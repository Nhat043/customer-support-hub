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
  createdAt: string;
  createdBy?: { fullName: string };
  events: Array<{ id: string; eventType: string; createdAt: string }>;
};

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
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session || !params.orgSlug || !params.id) return;
    const currentSession = session;

    async function load() {
      try {
        const [workflowItem, workflowComments] = await Promise.all([
          apiFetch<WorkflowItem>(`/orgs/${params.orgSlug}/workflow-items/${params.id}`, {
            accessToken: currentSession.accessToken
          }),
          apiFetch<Comment[]>(
            `/orgs/${params.orgSlug}/workflow-items/${params.id}/comments`,
            { accessToken: currentSession.accessToken }
          )
        ]);
        setItem(workflowItem);
        setComments(workflowComments);
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

  if (!item) {
    return <section className="card">{error ?? "Loading workflow item..."}</section>;
  }

  return (
    <section className="grid two">
      <div className="grid">
        <section className="card">
          <Link className="muted" href={`/orgs/${params.orgSlug}/workflow-items`}>
            Back to workflow
          </Link>
          <div className="row" style={{ marginTop: 18 }}>
            <span className="badge">{item.status}</span>
            <span className="badge">{item.priority}</span>
          </div>
          <h2>{item.title}</h2>
          <p className="muted">{item.description ?? "No description"}</p>
          <p className="muted">
            Created by {item.createdBy?.fullName ?? "Unknown"} on {new Date(item.createdAt).toLocaleString()}
          </p>
        </section>

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
