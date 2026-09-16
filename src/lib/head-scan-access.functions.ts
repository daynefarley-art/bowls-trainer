import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isHeadScanAllowedUser } from "./head-scan-access";

/**
 * Server-side authorisation check for Head Scan. Any future Head Scan server
 * work must call this (or re-use isHeadScanAllowedUser with context.userId)
 * so access is enforced on the server, not only in the UI.
 */
export const assertHeadScanAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!isHeadScanAllowedUser(context.userId)) {
      throw new Error("Forbidden: Head Scan is not enabled for this account");
    }
    return { allowed: true as const };
  });
