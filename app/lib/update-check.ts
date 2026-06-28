/**
 * Self-hosted update notifier.
 *
 * Asks the GitHub Releases API whether the upstream repo has a newer release
 * than the running `APP_VERSION`, throttled to one network call per cache TTL
 * (the result is cached in `app_settings`). The check is admin-facing and
 * best-effort: a failed GitHub call never surfaces an error, it just falls back
 * to the last cached result (or "no update known").
 *
 * Configuration (all optional): `UPDATE_CHECK_REPO` overrides the `owner/repo`
 * to poll; `UPDATE_CHECK_ENABLED=false` disables it at the env level (an admin
 * can also toggle it per-instance via Settings -> [[settings-store]]).
 */

import { getAppSetting, resolveUpdateCheckEnabled, setAppSetting } from "./settings-store";
import { APP_VERSION } from "./version";

const CACHE_KEY = "update.lastCheck";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const DEFAULT_REPO = "joshrmcdaniel/translatarr";

export type UpdateStatus = {
  enabled: boolean;
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  checkedAt: string | null;
};

type CachedCheck = {
  checkedAt: string;
  latestVersion: string | null;
  releaseUrl: string | null;
};

type GitHubRelease = {
  tag_name?: string;
  html_url?: string;
};

function repoSlug(): string {
  return process.env.UPDATE_CHECK_REPO?.trim() || DEFAULT_REPO;
}

function normalize(version: string): string {
  return version.trim().replace(/^v/i, "");
}

/**
 * Compares two `major.minor.patch[-prerelease]` versions, returning 1 when `a`
 * is newer than `b`, -1 when older, and 0 when equal. A bare release outranks a
 * prerelease of the same core (so `0.2.1` > `0.2.1-rc1`).
 */
export function compareVersions(a: string, b: string): number {
  const [aCore, aPre] = normalize(a).split("-", 2);
  const [bCore, bPre] = normalize(b).split("-", 2);
  const aParts = aCore.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const bParts = bCore.split(".").map((part) => Number.parseInt(part, 10) || 0);

  for (let index = 0; index < Math.max(aParts.length, bParts.length); index += 1) {
    const diff = (aParts[index] ?? 0) - (bParts[index] ?? 0);
    if (diff !== 0) {
      return diff > 0 ? 1 : -1;
    }
  }

  if (aPre && !bPre) return -1;
  if (!aPre && bPre) return 1;
  if (aPre && bPre && aPre !== bPre) return aPre > bPre ? 1 : -1;
  return 0;
}

function readCache(): CachedCheck | null {
  const raw = getAppSetting(CACHE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as CachedCheck;
  } catch {
    return null;
  }
}

async function fetchLatestRelease(): Promise<CachedCheck> {
  const response = await fetch(`https://api.github.com/repos/${repoSlug()}/releases/latest`, {
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "translatarr-update-check",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub releases API responded ${response.status}`);
  }

  const release = (await response.json()) as GitHubRelease;
  return {
    checkedAt: new Date().toISOString(),
    latestVersion: release.tag_name ? normalize(release.tag_name) : null,
    releaseUrl: release.html_url ?? null,
  };
}

function buildStatus(cache: CachedCheck | null, enabled: boolean): UpdateStatus {
  const latestVersion = cache?.latestVersion ?? null;
  return {
    enabled,
    currentVersion: APP_VERSION,
    latestVersion,
    updateAvailable: latestVersion !== null && compareVersions(latestVersion, APP_VERSION) > 0,
    releaseUrl: cache?.releaseUrl ?? null,
    checkedAt: cache?.checkedAt ?? null,
  };
}

/**
 * Resolves the current update status, refreshing from GitHub at most once per
 * {@link CACHE_TTL_MS}. The GitHub call is wrapped because a network/API failure
 * is an expected, recoverable condition here — we fall back to the last cached
 * result so the check never breaks the page.
 */
export async function getUpdateStatus(): Promise<UpdateStatus> {
  if (!resolveUpdateCheckEnabled()) {
    return buildStatus(null, false);
  }

  const cache = readCache();
  const isFresh = cache !== null && Date.now() - new Date(cache.checkedAt).getTime() < CACHE_TTL_MS;

  if (isFresh) {
    return buildStatus(cache, true);
  }

  try {
    const refreshed = await fetchLatestRelease();
    setAppSetting(CACHE_KEY, JSON.stringify(refreshed));
    return buildStatus(refreshed, true);
  } catch {
    return buildStatus(cache, true);
  }
}
