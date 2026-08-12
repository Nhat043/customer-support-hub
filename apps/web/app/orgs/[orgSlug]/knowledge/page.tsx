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

export default function KnowledgePage() {
  const params = useParams<{ orgSlug: string }>();
  const searchParams = useSearchParams();
  const [orgSlug, setOrgSlug] = useState("demo");
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
    setOrgSlug(params.orgSlug ?? "demo");
  }, [params.orgSlug]);

  useEffect(() => {
    void loadDocuments();
  }, [orgSlug]);

  useEffect(() => {
    const documentId = searchParams.get("document");
    if (!documentId || orgSlug === "demo") {
      setSelectedDocument(null);
      return;
    }
    void loadDocument(documentId);
  }, [orgSlug, searchParams]);

  async function loadDocuments() {
    const session = getSession();
    if (!session) return;
    setLoading(true);
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
    if (!selected.name.toLowerCase().endsWith(".md")) {
      setFile(null);
      setError("Choose a Markdown (.md) file.");
      return;
    }
    setFile(selected);
    setTitle(selected.name.replace(/\.md$/i, "").replace(/[-_]+/g, " "));
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const session = getSession();
    if (!session || !file || !canManage) return;
    setUploading(true);
    setError("");
    try {
      const content = await file.text();
      await apiFetch(`/orgs/${orgSlug}/knowledge`, {
        method: "POST",
        accessToken: session.accessToken,
        body: JSON.stringify({ fileName: file.name, title: title.trim() || undefined, content })
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
          <div className="badge">Workspace knowledge</div>
          <h2>Ground answers in your support playbook</h2>
          <p className="muted">Markdown is chunked, embedded, and scoped to the active support queue. The AI shows its matching sources with every answer.</p>
        </div>
        {canManage ? (
          <form className="grid" onSubmit={upload}>
            <label className="grid">
              <span>Markdown file</span>
              <input className="input" type="file" accept=".md,text/markdown" onChange={selectFile} required />
            </label>
            <label className="grid">
              <span>Document title</span>
              <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Support playbook" maxLength={160} />
            </label>
            <button className="btn primary" type="submit" disabled={!file || uploading}>
              {uploading ? "Indexing knowledge..." : "Upload and index Markdown"}
            </button>
          </form>
        ) : <p className="muted">Only workspace owners and admins can upload or remove knowledge documents.</p>}
        {error ? <p className="error">{error}</p> : null}
      </section>

      <aside className="card grid">
        <div className="badge">How citations work</div>
        <h3>Tenant-safe retrieval</h3>
        <p className="muted">The vector search always filters by your organization, active workspace, and the knowledge source type. Private copilot memory is never searched as workspace knowledge.</p>
        <p className="muted">A failed index stays visible. An owner or admin can retry the existing document after the embedding service recovers, without uploading it again.</p>
      </aside>

      <section className="card grid" style={{ gridColumn: "1 / -1" }}>
        <div>
          <div className="badge">Indexed documents</div>
          <h2>Knowledge library</h2>
        </div>
        {loading ? <p className="muted">Loading documents...</p> : null}
        {!loading && documents.length === 0 ? <p className="muted">No Markdown documents have been indexed for this support queue yet.</p> : null}
        <div className="list">
          {documents.map((document) => (
            <article className="card" key={document.id}>
              <div className="row" style={{ justifyContent: "space-between", gap: 16 }}>
                <div>
                  <strong>{document.title}</strong>
                  <p className="muted">{document.fileName} · {document.chunkCount} chunks · {document.status.toLowerCase()}</p>
                  <p className="muted">Uploaded by {document.uploadedBy.fullName} on {new Date(document.createdAt).toLocaleString()}</p>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn secondary compact" type="button" onClick={() => void loadDocument(document.id)}>View source</button>
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
              <p className="muted">{selectedDocument.fileName} · {selectedDocument.chunkCount} chunks · {selectedDocument.status.toLowerCase()}</p>
            </div>
            <button className="btn secondary compact" type="button" onClick={() => setSelectedDocument(null)}>Close source</button>
          </div>
          <div className="list">
            {selectedDocument.chunks.map((chunk) => (
              <article className={`card${searchParams.get("chunk") === chunk.id ? " knowledge-chunk-highlight" : ""}`} id={`chunk-${chunk.id}`} key={chunk.id}>
                <strong>Chunk {chunk.ordinal + 1}</strong>
                <p className="knowledge-source-content">{chunk.content}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
