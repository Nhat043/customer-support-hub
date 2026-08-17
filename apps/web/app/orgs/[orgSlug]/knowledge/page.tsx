"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";

type KnowledgeDocument = {
  id: string;
  title: string;
  fileName: string;
  status: "INDEXING" | "READY" | "FAILED";
  chunkCount: number;
  createdAt: string;
  uploadedBy: { fullName: string; email: string };
};

type KnowledgeDocumentDetail = KnowledgeDocument & {
  chunks: Array<{ id: string; ordinal: number; content: string; createdAt: string }>;
};

function combineGuideSections(chunks: KnowledgeDocumentDetail["chunks"]) {
  return [...chunks]
    .sort((left, right) => left.ordinal - right.ordinal)
    .reduce((guide, chunk) => {
      const next = chunk.content.trim();
      if (!guide) return next;

      // Indexing uses a small overlap for search quality. Remove that overlap
      // when presenting the guide so people read one continuous document.
      const maxOverlap = Math.min(guide.length, next.length, 300);
      for (let length = maxOverlap; length >= 24; length -= 1) {
        if (guide.slice(-length) === next.slice(0, length)) {
          return `${guide}${next.slice(length)}`;
        }
      }
      return `${guide}\n\n${next}`;
    }, "");
}

export default function KnowledgePage() {
  const params = useParams<{ orgSlug: string }>();
  const searchParams = useSearchParams();
  const [orgSlug, setOrgSlug] = useState("");
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<KnowledgeDocumentDetail | null>(null);
  const [loadingDocument, setLoadingDocument] = useState(false);
  const [retryingDocumentId, setRetryingDocumentId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const role = getSession()?.activeMembershipRole;
  const canManage = role === "OWNER" || role === "ADMIN";

  useEffect(() => {
    if (params.orgSlug) setOrgSlug(params.orgSlug);
  }, [params.orgSlug]);

  useEffect(() => {
    if (!orgSlug) return;
    void loadDocuments();
  }, [orgSlug]);

  useEffect(() => {
    const documentId = searchParams.get("document");
    if (!documentId || !orgSlug) {
      setSelectedDocument(null);
      return;
    }
    void loadDocument(documentId);
  }, [orgSlug, searchParams]);

  async function loadDocuments() {
    const session = getSession();
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      setDocuments(await apiFetch<KnowledgeDocument[]>(`/orgs/${orgSlug}/knowledge`, { accessToken: session.accessToken }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load workspace knowledge.");
    } finally {
      setLoading(false);
    }
  }

  async function loadDocument(documentId: string) {
    const session = getSession();
    if (!session) return;
    setLoadingDocument(true);
    setError("");
    try {
      setSelectedDocument(await apiFetch<KnowledgeDocumentDetail>(`/orgs/${orgSlug}/knowledge/${documentId}`, { accessToken: session.accessToken }));
    } catch (loadError) {
      setSelectedDocument(null);
      setError(loadError instanceof Error ? loadError.message : "Could not load this knowledge source.");
    } finally {
      setLoadingDocument(false);
    }
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError("");
    if (!selected) {
      setFile(null);
      return;
    }
    if (!/\.(md|pdf|docx)$/i.test(selected.name)) {
      setFile(null);
      setError("Choose a Markdown (.md), PDF (.pdf), or Word (.docx) guide.");
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setFile(null);
      setError("Knowledge guides must be 10 MB or smaller.");
      return;
    }
    setFile(selected);
    setTitle(selected.name.replace(/\.(md|pdf|docx)$/i, "").replace(/[-_]+/g, " "));
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const session = getSession();
    if (!session || !file || !canManage) return;
    setUploading(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      if (title.trim()) body.append("title", title.trim());
      await apiFetch(`/orgs/${orgSlug}/knowledge`, {
        method: "POST",
        accessToken: session.accessToken,
        body
      });
      setFile(null);
      setTitle("");
      await loadDocuments();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not index this knowledge document.");
    } finally {
      setUploading(false);
    }
  }

  async function remove(documentId: string) {
    const session = getSession();
    if (!session || !canManage || !window.confirm("Delete this knowledge document and all of its indexed chunks?")) return;
    setError("");
    try {
      await apiFetch(`/orgs/${orgSlug}/knowledge/${documentId}`, {
        method: "DELETE",
        accessToken: session.accessToken
      });
      if (selectedDocument?.id === documentId) setSelectedDocument(null);
      await loadDocuments();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete this knowledge document.");
    }
  }

  async function retry(documentId: string) {
    const session = getSession();
    if (!session || !canManage || retryingDocumentId) return;
    setRetryingDocumentId(documentId);
    setError("");
    try {
      await apiFetch(`/orgs/${orgSlug}/knowledge/${documentId}/retry`, {
        method: "POST",
        accessToken: session.accessToken
      });
      await Promise.all([loadDocuments(), loadDocument(documentId)]);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Could not retry this knowledge document.");
    } finally {
      setRetryingDocumentId(null);
    }
  }

  return (
    <section className="grid two">
      <section className="card grid">
          <div>
          <div className="badge">Optional AI playbook</div>
          <h2>Teach the AI your team&apos;s support rules</h2>
          <p className="muted">Use this only for stable internal guidance, such as refund policy, delivery process, or team FAQ. The AI searches these guides before it answers and shows the source it used.</p>
        </div>
        {canManage ? (
          <form className="grid" onSubmit={upload}>
            <label className="grid">
              <span>Support guide (.md, .pdf, or .docx)</span>
              <input className="input" type="file" accept=".md,.pdf,.docx,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={selectFile} required />
              <small className="muted">Use text-based documents up to 10 MB. Scanned PDFs need OCR before upload.</small>
            </label>
            <label className="grid">
              <span>Document title</span>
              <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Support playbook" maxLength={160} />
            </label>
            <button className="btn primary" type="submit" disabled={!file || uploading}>
              {uploading ? "Extracting and indexing guide..." : "Add guide to AI playbook"}
            </button>
          </form>
        ) : <p className="muted">You can read this playbook. Workspace owners and admins can add, retry, or remove guides.</p>}
        {error ? <p className="error">{error}</p> : null}
      </section>

      <aside className="card grid">
        <div className="badge">How it works</div>
        <h3>Private to this workspace</h3>
        <p className="muted">When an owner or admin adds a Markdown, PDF, or Word guide, the app extracts its text, divides it into searchable sections, and lets the AI cite the relevant guide in its answer.</p>
        <p className="muted">Search is always limited to this company and this support queue. Other companies and private chat memory are never included. If indexing fails, an owner or admin can retry the same document.</p>
      </aside>

      <section className="card grid" style={{ gridColumn: "1 / -1" }}>
        <div>
          <div className="badge">Your team&apos;s AI playbook</div>
          <h2>Support guides</h2>
        </div>
        {loading ? <p className="muted">Loading documents...</p> : null}
        {!loading && documents.length === 0 ? <p className="muted">No guides have been added. This is optional: use it when your team has policies or processes the AI should follow consistently.</p> : null}
        <div className="list">
          {documents.map((document) => (
            <article className="card" key={document.id}>
              <div className="row" style={{ justifyContent: "space-between", gap: 16 }}>
                <div>
                  <strong>{document.title}</strong>
                  <p className="muted">{document.fileName} · {document.status.toLowerCase()}</p>
                  <p className="muted">Uploaded by {document.uploadedBy.fullName} on {new Date(document.createdAt).toLocaleString()}</p>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn secondary compact" type="button" onClick={() => void loadDocument(document.id)}>Open guide</button>
                  {canManage && document.status === "FAILED" ? <button className="btn primary compact" type="button" disabled={retryingDocumentId === document.id} onClick={() => void retry(document.id)}>{retryingDocumentId === document.id ? "Retrying..." : "Retry index"}</button> : null}
                  {canManage ? <button className="btn danger compact" type="button" onClick={() => void remove(document.id)}>Delete</button> : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {loadingDocument ? <section className="card" style={{ gridColumn: "1 / -1" }}><p className="muted">Loading knowledge source...</p></section> : null}
      {selectedDocument ? (
        <section className="card grid" style={{ gridColumn: "1 / -1" }}>
          <div className="row" style={{ justifyContent: "space-between", gap: 16 }}>
            <div>
              <div className="badge">Source document</div>
              <h2>{selectedDocument.title}</h2>
              <p className="muted">{selectedDocument.fileName} · {selectedDocument.status.toLowerCase()}</p>
            </div>
            <button className="btn secondary compact" type="button" onClick={() => setSelectedDocument(null)}>Close source</button>
          </div>
          <article className="card knowledge-guide-preview">
            <strong>Guide contents</strong>
            <p className="knowledge-source-content">{combineGuideSections(selectedDocument.chunks)}</p>
          </article>
        </section>
      ) : null}
    </section>
  );
}
