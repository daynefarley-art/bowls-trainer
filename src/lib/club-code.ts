import { supabase } from "@/integrations/supabase/client";

export type ClubCodeCheck = {
  valid: boolean;
  club_id: string | null;
  club_name: string | null;
  reason: string | null;
};

/** Validate a club join code. Safe to call before sign-in. */
export async function validateClubCode(code: string): Promise<ClubCodeCheck> {
  const { data, error } = await (supabase as any).rpc("validate_club_code", { _code: code });
  if (error) return { valid: false, club_id: null, club_name: null, reason: "error" };
  const row = (data ?? [])[0] as ClubCodeCheck | undefined;
  return row ?? { valid: false, club_id: null, club_name: null, reason: "not_found" };
}

/** Join the club a code resolves to. Always creates a plain member membership. */
export async function joinClubWithCode(
  code: string,
): Promise<{ club_id: string; club_name: string; already_member: boolean }> {
  const { data, error } = await (supabase as any).rpc("join_club_with_code", { _code: code });
  if (error) throw error;
  const row = (data ?? [])[0];
  if (!row) throw new Error("invalid_code");
  return row;
}

export function clubCodeErrorMessage(reason: string | null): string {
  switch (reason) {
    case "disabled":
      return "This club code is no longer active. Ask your club for a current code.";
    case "not_found":
      return "That club code wasn't recognised. Check it and try again.";
    case "empty":
      return "Enter a club code.";
    default:
      return "That club code couldn't be used right now.";
  }
}
