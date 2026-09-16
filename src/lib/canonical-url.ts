/**
 * Canonical production origin for Bowls Trainer.
 *
 * Single source of truth for every absolute, user-facing URL the app or its
 * server functions generate (password recovery, auth emails, invitations).
 *
 * Runtime, in-app links should keep using `window.location.origin` so previews
 * and the native WebView stay self-consistent. Use this constant only where an
 * absolute production URL is required (emails, server functions).
 */
export const CANONICAL_APP_URL = "https://app.bowlstrainer.com";

/** Legacy Lovable-hosted production origin, kept as a transition fallback only. */
export const LEGACY_APP_URL = "https://bowlmate-progress-tracker.lovable.app";

/** Canonical scanner-safe password recovery destination. */
export const PASSWORD_RESET_URL = `${CANONICAL_APP_URL}/reset-password`;
