/**
 * TEMPORARY HEAD SCAN ALLOWLIST.
 *
 * Head Scan / BowlMate measurement is restricted to explicitly allowlisted
 * authenticated user IDs while it is in private testing. Add beta testers by
 * appending their auth user ID to HEAD_SCAN_ALLOWED_USER_IDS.
 *
 * The user ID is the permission check. Emails are only kept as a legacy
 * convenience for the older diagnostics gate.
 */
export const HEAD_SCAN_ALLOWED_USER_IDS: readonly string[] = [
  // dayne@tss.co.nz — owner
  "4f72e0bd-4068-4da9-8615-2b1d59f7d277",
];

export function isHeadScanAllowedUser(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return HEAD_SCAN_ALLOWED_USER_IDS.includes(userId);
}
