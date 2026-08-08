"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getSession, type MembershipRole } from "@/lib/auth";

type TeamMember = {
  id: string;
  role: MembershipRole;
  user: { id: string; fullName: string; email: string; status: string };
};

type Invitation = {
  id: string;
  email: string;
  role: MembershipRole;
  expiresAt: string;
  invitedBy: { fullName: string };
};

const roles: MembershipRole[] = ["ADMIN", "MEMBER", "VIEWER"];

export default function TeamPage() {
  const params = useParams<{ orgSlug: string }>();
  const orgSlug = params.orgSlug;
  const session = getSession();
  const role = session?.activeMembershipRole;
  const isOwner = role === "OWNER";
  const canManage = isOwner || role === "ADMIN";
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MembershipRole>("MEMBER");
  const [inviteLink, setInviteLink] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!session || !orgSlug || !canManage) return;
    try {
      const [loadedMembers, loadedInvitations] = await Promise.all([
        apiFetch<TeamMember[]>(`/orgs/${orgSlug}/members`, { accessToken: session.accessToken }),
        apiFetch<Invitation[]>(`/orgs/${orgSlug}/invitations`, { accessToken: session.accessToken }),
      ]);
      setMembers(loadedMembers);
      setInvitations(loadedInvitations);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load your team.");
    }
  }

  useEffect(() => {
    void load();
  }, [orgSlug]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !email.trim()) return;
    setLoading(true);
    setError("");
    setInviteLink("");
    try {
      const created = await apiFetch<{ token: string }>(`/orgs/${orgSlug}/invitations`, {
        method: "POST",
        accessToken: session.accessToken,
        body: JSON.stringify({ email: email.trim(), role: inviteRole }),
      });
      setInviteLink(`${window.location.origin}/join?token=${encodeURIComponent(created.token)}`);
      setEmail("");
      await load();
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "Could not create invitation.");
    } finally {
      setLoading(false);
    }
  }

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
    } catch {
      setError("Copy this invitation link manually.");
    }
  }

  async function changeRole(memberId: string, nextRole: MembershipRole) {
    if (!session) return;
    setError("");
    try {
      await apiFetch(`/orgs/${orgSlug}/members/${memberId}`, {
        method: "PATCH",
        accessToken: session.accessToken,
        body: JSON.stringify({ role: nextRole }),
      });
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update this team member.");
    }
  }

  async function removeMember(memberId: string) {
    if (!session) return;
    setError("");
    try {
      await apiFetch(`/orgs/${orgSlug}/members/${memberId}`, {
        method: "DELETE",
        accessToken: session.accessToken,
      });
      await load();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove this team member.");
    }
  }

  async function revokeInvitation(invitationId: string) {
    if (!session) return;
    try {
      await apiFetch(`/orgs/${orgSlug}/invitations/${invitationId}`, {
        method: "DELETE",
        accessToken: session.accessToken,
      });
      await load();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Could not revoke this invitation.");
    }
  }

  if (!canManage) {
    return (
      <section className="card">
        <div className="badge">Team access</div>
        <h2>Only workspace owners and admins can manage the team.</h2>
        <p className="muted">Ask an owner if your team access needs to change.</p>
      </section>
    );
  }

  return (
    <section className="grid" style={{ gap: 24 }}>
      <div className="grid two">
        <section className="card">
          <div className="badge">Team members</div>
          <h2>Invite someone to help with customer requests</h2>
          <p className="muted">Each person uses their own email and password. The selected role controls what they can do in this workspace.</p>
          <form className="grid" onSubmit={invite}>
            <input className="input" type="email" placeholder="teammate@company.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <select className="select" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as MembershipRole)}>
              {roles.filter((value) => isOwner || value !== "ADMIN").map((value) => (
                <option key={value} value={value}>{value[0]}{value.slice(1).toLowerCase()}</option>
              ))}
            </select>
            <button className="btn primary" type="submit" disabled={loading}>
              {loading ? "Creating invitation..." : "Create invitation link"}
            </button>
          </form>
          {inviteLink ? (
            <div className="card" style={{ marginTop: 18 }}>
              <strong>Invitation link is ready</strong>
              <p className="muted" style={{ overflowWrap: "anywhere" }}>{inviteLink}</p>
              <button className="btn secondary" type="button" onClick={() => void copyInviteLink()}>Copy invitation link</button>
            </div>
          ) : null}
        </section>

        <section className="card">
          <div className="badge">Role guide</div>
          <h2>What each role can do</h2>
          <div className="list muted">
            <p><strong>Owner:</strong> manages company settings, team, and workspace structure.</p>
            <p><strong>Admin:</strong> invites members/viewers and manages support work.</p>
            <p><strong>Member:</strong> creates and resolves customer requests with the team.</p>
            <p><strong>Viewer:</strong> can read requests and dashboard data only.</p>
          </div>
        </section>
      </div>

      {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}

      <section className="card">
        <div className="badge">Active team</div>
        <h2>People in this workspace</h2>
        <div className="list">
          {members.map((member) => (
            <article className="card" key={member.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <strong>{member.user.fullName}</strong>
                  <p className="muted">{member.user.email}</p>
                </div>
                {member.role === "OWNER" ? <span className="badge">Owner</span> : null}
                {member.role !== "OWNER" && isOwner ? (
                  <div className="row">
                    <select className="select" value={member.role} onChange={(event) => void changeRole(member.id, event.target.value as MembershipRole)}>
                      {roles.map((value) => <option key={value} value={value}>{value[0]}{value.slice(1).toLowerCase()}</option>)}
                    </select>
                    <button className="btn secondary" type="button" onClick={() => void removeMember(member.id)}>Remove</button>
                  </div>
                ) : null}
                {member.role !== "OWNER" && !isOwner ? <span className="badge">{member.role.toLowerCase()}</span> : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="badge">Pending invitations</div>
        <h2>Waiting for teammates to join</h2>
        <div className="list">
          {invitations.length === 0 ? <p className="muted">No pending invitations.</p> : null}
          {invitations.map((invitation) => (
            <article className="card" key={invitation.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <strong>{invitation.email}</strong>
                  <p className="muted">{invitation.role.toLowerCase()} access, expires {new Date(invitation.expiresAt).toLocaleDateString()}</p>
                </div>
                <button className="btn secondary" type="button" onClick={() => void revokeInvitation(invitation.id)}>Revoke</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
