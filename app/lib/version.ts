import pkg from "../../package.json";

/**
 * The Translatarr app version, read from `package.json` at build time so there
 * is a single source of truth. Server-side only — keep this out of client
 * bundles (it is surfaced to the UI through `SettingsView.version`).
 */
export const APP_VERSION: string = pkg.version;
