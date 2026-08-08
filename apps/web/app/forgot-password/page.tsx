"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { apiFetch } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await apiFetch("/auth/password-reset/request", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSubmitted(true);
    } catch {
      setError("We could not request a reset code. Please wait a moment and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="public-page">
      <div className="public-container">
        <PublicHeader helperText="Remembered it?" actionHref="/login" actionLabel="Sign in" />
        <section className="setup-panel">
          <Link className="back-link" href="/login">Back to sign in</Link>
          <div className="badge">Password recovery</div>
          <h1>Reset your password</h1>
          <p className="muted setup-description">
            Enter your account email. If an account exists, a six-digit reset code will arrive shortly.
          </p>
          {submitted ? (
            <div className="grid">
              <p className="form-success">If that email has an active account, we sent a reset code.</p>
              <Link className="btn primary" href={`/reset-password?email=${encodeURIComponent(email.trim())}`}>
                Enter reset code
              </Link>
              <button className="btn secondary" type="button" onClick={() => setSubmitted(false)}>
                Use a different email
              </button>
            </div>
          ) : (
            <form className="grid" onSubmit={requestCode}>
              <label className="grid">
                <span>Email</span>
                <input
                  className="input"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              {error ? <p className="form-error">{error}</p> : null}
              <button className="btn primary" disabled={loading} type="submit">
                {loading ? "Sending code..." : "Email reset code"}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
