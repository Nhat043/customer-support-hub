"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PublicHeader } from "@/components/public-header";
import { apiFetch } from "@/lib/api";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="page-shell" />}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<{ resetToken: string }>("/auth/password-reset/verify", {
        method: "POST",
        body: JSON.stringify({ email, otp }),
      });
      setResetToken(result.resetToken);
    } catch {
      setError("That code is invalid or expired. Request a new code and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await apiFetch("/auth/password-reset/confirm", {
        method: "POST",
        body: JSON.stringify({ resetToken, password }),
      });
      router.push("/login?reset=success");
    } catch {
      setError("This reset session expired. Request a new code and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="public-page">
      <div className="public-container">
        <PublicHeader helperText="Back to account" actionHref="/login" actionLabel="Sign in" />
        <section className="setup-panel">
          <Link className="back-link" href="/forgot-password">Request another code</Link>
          <div className="badge">Password recovery</div>
          <h1>{resetToken ? "Choose a new password" : "Enter your reset code"}</h1>
          <p className="muted setup-description">
            {resetToken
              ? "Your code is verified. Choose a new password with at least eight characters."
              : "Enter the six-digit code from your email. Codes expire after ten minutes."}
          </p>
          {resetToken ? (
            <form className="grid" onSubmit={updatePassword}>
              <label className="grid">
                <span>New password</span>
                <input className="input" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
              </label>
              <label className="grid">
                <span>Confirm new password</span>
                <input className="input" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required />
              </label>
              {error ? <p className="form-error">{error}</p> : null}
              <button className="btn primary" disabled={loading} type="submit">
                {loading ? "Updating password..." : "Update password"}
              </button>
            </form>
          ) : (
            <form className="grid" onSubmit={verifyCode}>
              <label className="grid">
                <span>Email</span>
                <input className="input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </label>
              <label className="grid">
                <span>Six-digit code</span>
                <input className="input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} required />
              </label>
              {error ? <p className="form-error">{error}</p> : null}
              <button className="btn primary" disabled={loading} type="submit">
                {loading ? "Verifying code..." : "Verify code"}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
