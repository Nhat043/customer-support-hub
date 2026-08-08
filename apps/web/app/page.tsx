"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PublicHeader } from "@/components/public-header";
import { getSession } from "@/lib/auth";

export default function HomePage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  const session = ready ? getSession() : null;

  return (
    <main className="public-page">
      <div className="public-container">
        <PublicHeader actionHref="/login" actionLabel="Sign in" />

        <section className="landing-hero">
          <div className="landing-copy">
            <span className="badge">For customer support and operations teams</span>
            <h1>Turn every customer request into a clear next step.</h1>
            <p>
              Customer Support Hub is one shared place to receive, assign, and
              resolve delivery issues, refund requests, and customer questions.
            </p>
            <div className="row landing-actions">
              {session ? (
                <Link
                  className="btn primary"
                  href={`/orgs/${session.activeOrganizationSlug ?? "demo"}/dashboard`}
                >
                  Open dashboard
                </Link>
              ) : (
                <Link className="btn primary" href="/login">
                  Sign in
                </Link>
              )}
              <Link className="btn secondary" href="/register">
                Create company workspace
              </Link>
            </div>
            <p className="landing-note">
              Already invited by your company? Use the invitation link from your
              workspace owner to create or connect your account.
            </p>
          </div>

          <aside className="landing-flow" aria-label="How Customer Support Hub works">
            <p className="eyebrow">How the team works</p>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <strong>Capture the request</strong>
                  <p>Keep the customer issue and its context in one record.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Route it to the right person</strong>
                  <p>Assign the request to support or operations with a clear owner.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Resolve together</strong>
                  <p>Track the work, add notes, and use the assistant when needed.</p>
                </div>
              </li>
            </ol>
          </aside>
        </section>

        <section className="landing-roles" aria-label="Who uses the workspace">
          <div>
            <p className="eyebrow">One workspace, clear responsibilities</p>
            <h2>Everyone has a role in resolving the request.</h2>
          </div>
          <div className="role-summary">
            <article>
              <strong>Workspace owner</strong>
              <p>Sets up the company workspace and invites the team.</p>
            </article>
            <article>
              <strong>Support team</strong>
              <p>Creates, updates, and follows up on customer requests.</p>
            </article>
            <article>
              <strong>View-only teammates</strong>
              <p>Stay informed without changing requests or assignments.</p>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
