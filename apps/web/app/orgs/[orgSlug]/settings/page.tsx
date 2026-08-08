"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";

type Organization = { id: string; slug: string; name: string };
type Workspace = { id: string; slug: string; name: string };

export default function OrgSettingsPage() {
  const router = useRouter();
  const params = useParams<{ orgSlug: string }>();
  const [orgSlug, setOrgSlug] = useState("demo");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [organizationName, setOrganizationName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setOrgSlug(params.orgSlug ?? "demo");
  }, [params.orgSlug]);

  useEffect(() => {
    const session = getSession();
    if (!session || orgSlug === "demo") return;
    const currentSession = session;

    async function load() {
      try {
        const [orgs, currentWorkspaces] = await Promise.all([
          apiFetch<Organization[]>("/orgs", { accessToken: currentSession.accessToken }),
          apiFetch<Workspace[]>(`/orgs/${orgSlug}/workspaces`, {
            accessToken: currentSession.accessToken
          })
        ]);
        setOrganizations(orgs);
        setWorkspaces(currentWorkspaces);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load settings");
      }
    }

    void load();
  }, [orgSlug]);

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const session = getSession();
    if (!session || !organizationName.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const organization = await apiFetch<Organization>("/orgs", {
        method: "POST",
        accessToken: session.accessToken,
        body: JSON.stringify({ name: organizationName.trim() })
      });
      await apiFetch(`/orgs/${organization.slug}/switch`, {
        method: "POST",
        accessToken: session.accessToken
      });
      setOrganizationName("");
      session.activeOrganizationSlug = organization.slug;
      sessionStorage.setItem("customer-support-hub.session", JSON.stringify(session));
      router.push(`/orgs/${organization.slug}/settings`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create organization");
    } finally {
      setLoading(false);
    }
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const session = getSession();
    if (!session || !workspaceName.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const workspace = await apiFetch<Workspace>(`/orgs/${orgSlug}/workspaces`, {
        method: "POST",
        accessToken: session.accessToken,
        body: JSON.stringify({ name: workspaceName.trim() })
      });
      setWorkspaceName("");
      setWorkspaces((current) => [...current, workspace]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create workspace");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="grid two">
      <div className="grid">
        <section className="card">
          <div className="badge">Organization</div>
          <h2>{orgSlug}</h2>
          <p className="muted">Organizations available to the current user.</p>
          <div className="list">
            {organizations.map((organization) => (
              <button
                className="btn secondary"
                key={organization.id}
                type="button"
                onClick={() => router.push(`/orgs/${organization.slug}/settings`)}
              >
                {organization.name}
              </button>
            ))}
          </div>
        </section>

        <form className="card grid" onSubmit={createOrganization}>
          <h3 style={{ margin: 0 }}>Create organization</h3>
          <input
            className="input"
            placeholder="Organization name"
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            minLength={2}
            required
          />
          <button className="btn primary" disabled={loading} type="submit">
            Create organization
          </button>
        </form>
      </div>

      <div className="grid">
        <section className="card">
          <div className="badge">Workspace</div>
          <h2>Workspaces</h2>
          <div className="list">
            {workspaces.map((workspace) => (
              <div className="card" key={workspace.id}>
                <strong>{workspace.name}</strong>
                <div className="muted">{workspace.slug}</div>
              </div>
            ))}
          </div>
        </section>

        <form className="card grid" onSubmit={createWorkspace}>
          <h3 style={{ margin: 0 }}>Create workspace</h3>
          <input
            className="input"
            placeholder="Workspace name"
            value={workspaceName}
            onChange={(event) => setWorkspaceName(event.target.value)}
            minLength={2}
            required
          />
          <button className="btn primary" disabled={loading} type="submit">
            Create workspace
          </button>
        </form>
      </div>

      {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
    </section>
  );
}
