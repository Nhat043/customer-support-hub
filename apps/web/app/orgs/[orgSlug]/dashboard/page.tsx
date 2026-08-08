"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { clearSession, getSession, saveSession, type MembershipRole } from "@/lib/auth";

type Organization = {
  id: string;
  slug: string;
  name: string;
};

type WorkflowItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
};

type Workspace = { id: string; slug: string; name: string };

export default function OrgDashboardPage() {
  const router = useRouter();
  const params = useParams<{ orgSlug: string }>();
  const [orgSlug, setOrgSlug] = useState<string>("demo");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [items, setItems] = useState<WorkflowItem[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [ready, setReady] = useState(false);
  const session = getSession();
  const role = session?.activeMembershipRole;
  const isOwner = role === "OWNER";
  const canManageTeam = isOwner || role === "ADMIN";
  const activeOrganization = organizations.find((organization) => organization.slug === orgSlug);

  useEffect(() => {
    setOrgSlug(params.orgSlug ?? "demo");
  }, [params.orgSlug]);

  useEffect(() => {
    const activeSession = getSession();
    const accessToken = activeSession?.accessToken;
    if (!accessToken) return;

    async function load() {
      try {
        const orgs = await apiFetch<Organization[]>("/orgs", {
          accessToken
        });
        setOrganizations(orgs);

        const activeOrg = orgs.find((organization) => organization.slug === orgSlug) ?? orgs[0];
        if (!activeOrg) return;

        const orgWorkspaces = await apiFetch<Workspace[]>(
          `/orgs/${activeOrg.slug}/workspaces`,
          { accessToken }
        );
        setWorkspaces(orgWorkspaces);
        const activeWorkspace = orgWorkspaces[0];
        setWorkspaceSlug(activeWorkspace?.slug ?? "");

        const query = activeWorkspace ? `?workspaceId=${activeWorkspace.id}` : "";
        const workflowItems = await apiFetch<WorkflowItem[]>(
          `/orgs/${activeOrg.slug}/workflow-items${query}`,
          { accessToken }
        );
        setItems(workflowItems);
      } catch {
        clearSession();
      } finally {
        setReady(true);
      }
    }

    void load();
  }, [orgSlug]);

  async function switchOrganization(nextOrgSlug: string) {
    const activeSession = getSession();
    if (!activeSession) return;
    try {
      const switched = await apiFetch<{ activeMembershipRole: MembershipRole }>(
        `/orgs/${nextOrgSlug}/switch`,
        { method: "POST", accessToken: activeSession.accessToken }
      );
      activeSession.activeOrganizationSlug = nextOrgSlug;
      activeSession.activeMembershipRole = switched.activeMembershipRole;
      saveSession(activeSession);
      setOrgSlug(nextOrgSlug);
      router.push(`/orgs/${nextOrgSlug}/dashboard`);
    } catch {
      setReady(true);
    }
  }

  async function switchWorkspace(nextWorkspaceSlug: string) {
    const activeSession = getSession();
    if (!activeSession) return;
    const workspace = workspaces.find((item) => item.slug === nextWorkspaceSlug);
    if (!workspace) return;

    await apiFetch(`/orgs/${orgSlug}/workspaces/${nextWorkspaceSlug}/switch`, {
      method: "POST",
      accessToken: activeSession.accessToken
    });
    setWorkspaceSlug(nextWorkspaceSlug);
    const nextItems = await apiFetch<WorkflowItem[]>(
      `/orgs/${orgSlug}/workflow-items?workspaceId=${workspace.id}`,
      { accessToken: activeSession.accessToken }
    );
    setItems(nextItems);
  }

  return (
    <section className="dashboard-stack">
      <section className="dashboard-welcome">
        <div>
          <p className="eyebrow">{activeOrganization?.name ?? "Your company"}</p>
          <h1>{isOwner ? `Welcome, ${session?.user.fullName ?? "workspace owner"}.` : "Your support workspace"}</h1>
          <p>
            {isOwner
              ? "You created this company workspace. As its owner, you set up the team and decide who can manage customer requests."
              : "Use this workspace to see customer requests, their progress, and the work assigned to your team."}
          </p>
        </div>
        <div className="dashboard-company-selectors">
          <label>
            <span>Company</span>
            <select
              className="select"
              aria-label="Active company"
              value={orgSlug}
              onChange={(event) => void switchOrganization(event.target.value)}
              disabled={organizations.length < 2}
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.slug}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Support queue</span>
            <select
              className="select"
              aria-label="Active support queue"
              value={workspaceSlug}
              onChange={(event) => void switchWorkspace(event.target.value)}
              disabled={workspaces.length < 2}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.slug}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {isOwner ? (
        <section className="owner-setup">
          <div className="owner-setup-heading">
            <span className="badge">Owner setup guide</span>
            <h2>Start your support desk in two steps.</h2>
            <p>You only set up the company once. After that, your team works from Customer requests every day.</p>
          </div>
          <div className="owner-steps">
            <article>
              <span className="step-number">1</span>
              <div>
                <strong>Invite the people who will help customers</strong>
                <p>Add each teammate with their own email and choose what they can do: Admin, Member, or Viewer.</p>
                <Link className="btn primary" href={`/orgs/${orgSlug}/team`}>Invite your team</Link>
              </div>
            </article>
            <article>
              <span className="step-number">2</span>
              <div>
                <strong>Create the first customer request</strong>
                <p>Use a real question, refund, or delivery issue so the team has a shared item to work on.</p>
                <Link className="btn secondary" href={`/orgs/${orgSlug}/workflow-items`}>Create customer request</Link>
              </div>
            </article>
          </div>
          <p className="owner-setup-note">Optional: use AI helper after requests are available to test summaries and suggested next actions.</p>
        </section>
      ) : null}

      <section className="dashboard-content-grid">
        <section className="card request-overview">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Daily work</p>
              <h2>Customer requests</h2>
            </div>
            <Link className="text-link" href={`/orgs/${orgSlug}/workflow-items`}>Open all requests</Link>
          </div>

          {ready && items.length === 0 ? (
            <div className="empty-state">
              <strong>No customer requests yet</strong>
              <p>Start with one real issue your team needs to follow, such as a delivery delay or refund request.</p>
              <Link className="btn primary" href={`/orgs/${orgSlug}/workflow-items`}>Create first request</Link>
            </div>
          ) : null}

          <div className="list">
            {items.map((item) => (
              <article key={item.id} className="request-row">
                <div>
                  <strong>{item.title}</strong>
                  <p>Priority: {item.priority.toLowerCase()}</p>
                </div>
                <span className="badge">{item.status.toLowerCase()}</span>
              </article>
            ))}
          </div>
        </section>

        <aside className="dashboard-side-panel">
          <p className="eyebrow">Workspace snapshot</p>
          <h2>{items.length} open request{items.length === 1 ? "" : "s"}</h2>
          <p>{workspaces.length} support queue{workspaces.length === 1 ? "" : "s"} available for this company.</p>
          {canManageTeam ? (
            <Link className="btn secondary" href={`/orgs/${orgSlug}/team`}>Manage team and roles</Link>
          ) : null}
          <Link className="btn secondary" href={`/orgs/${orgSlug}/agent`}>Open AI helper</Link>
        </aside>
      </section>
    </section>
  );
}
