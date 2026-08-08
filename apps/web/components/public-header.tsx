import Link from "next/link";

type PublicHeaderProps = {
  actionHref?: string;
  actionLabel?: string;
  helperText?: string;
};

export function PublicHeader({
  actionHref,
  actionLabel,
  helperText
}: PublicHeaderProps) {
  return (
    <header className="public-header">
      <Link className="brand" href="/" aria-label="Customer Support Hub home">
        <span className="brand-mark" aria-hidden="true">CS</span>
        <span>
          <strong>Customer Support Hub</strong>
          <small>Shared request workspace</small>
        </span>
      </Link>

      <div className="public-header-actions">
        {helperText ? <span className="public-header-helper">{helperText}</span> : null}
        {actionHref && actionLabel ? (
          <Link className="btn secondary compact" href={actionHref}>
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </header>
  );
}
