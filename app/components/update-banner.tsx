"use client";

import { useI18n } from "../lib/i18n/i18n-context";

/**
 * Subtle, dismissible top bar shown to admins when a newer release is available.
 * The version text links to the GitHub release when a URL is known.
 */
export function UpdateBanner({
  version,
  releaseUrl,
  onDismiss,
}: {
  version: string;
  releaseUrl: string | null;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const label = t("updates.available", { version });

  return (
    <div className="update-banner" role="status">
      <span className="update-banner-text">
        {releaseUrl ? (
          <a href={releaseUrl} target="_blank" rel="noreferrer">
            {label}
          </a>
        ) : (
          label
        )}
      </span>
      <button type="button" className="update-banner-dismiss" aria-label={t("common.close")} onClick={onDismiss}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
