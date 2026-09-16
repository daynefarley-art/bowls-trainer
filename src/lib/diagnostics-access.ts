/**
 * PRIVATE TESTING & DIAGNOSTICS ACCESS.
 *
 * Access to the Head Scan Test area is restricted to one explicit developer
 * account by email. This is deliberately NOT role-based.
 */
export const DIAGNOSTICS_EMAIL = "dayne@tss.co.nz";

export function isDiagnosticsUser(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === DIAGNOSTICS_EMAIL;
}
