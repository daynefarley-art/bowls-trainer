import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyClubs, optOutClubSquad, type MyClub } from "@/lib/club.functions";
import { useCurrentUserId, useUserRoles } from "@/hooks/use-role";

type ClubContextValue = {
  clubs: MyClub[];
  activeClub: MyClub | null;
  setActiveClubId: (id: string | null) => void;
  isLoading: boolean;
  optOut: (clubId: string) => Promise<void>;
  /** Platform Super Admin: defaults to Bowls Trainer platform context. */
  isPlatformAdmin: boolean;
  /** True when a Super Admin is previewing a club rather than being in a real member context. */
  isPreviewing: boolean;
  exitPreview: () => void;
};

const ClubContext = createContext<ClubContextValue | null>(null);

// Member context persists across sessions.
const STORAGE_KEY = "bt-active-club-id";
// Super Admin club preview is deliberately session-scoped so a normal login
// always starts in Bowls Trainer platform context.
const PREVIEW_KEY = "bt-admin-preview-club-id";

export function ClubProvider({ children }: { children: ReactNode }) {
  const listMyClubsFn = useServerFn(listMyClubs);
  const optOutFn = useServerFn(optOutClubSquad);
  const queryClient = useQueryClient();

  const userId = useCurrentUserId();
  const { isAdmin, isLoading: rolesLoading } = useUserRoles(userId);

  const { data: clubs = [], isLoading } = useQuery({
    queryKey: ["my-clubs"],
    queryFn: () => listMyClubsFn({}),
    staleTime: 5 * 60 * 1000,
  });

  const [activeClubId, setActiveClubIdState] = useState<string | null>(null);

  // Restore persisted context once we know which kind of user this is.
  useEffect(() => {
    if (rolesLoading) return;
    if (typeof window === "undefined") return;
    if (isAdmin) {
      // Super Admin: never auto-adopt a club skin. Only an explicit in-session
      // "View as club" selection puts them into club context.
      localStorage.removeItem(STORAGE_KEY);
      setActiveClubIdState(sessionStorage.getItem(PREVIEW_KEY));
    } else {
      setActiveClubIdState(localStorage.getItem(STORAGE_KEY));
    }
  }, [isAdmin, rolesLoading]);

  // Members auto-select a valid club; admins stay on platform context.
  useEffect(() => {
    if (rolesLoading || isAdmin) return;
    if (clubs.length === 0) {
      setActiveClubIdState(null);
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const found = clubs.find((c) => c.id === activeClubId);
    if (!found) {
      const first = clubs[0];
      setActiveClubIdState(first.id);
      localStorage.setItem(STORAGE_KEY, first.id);
    }
  }, [clubs, activeClubId, isAdmin, rolesLoading]);

  // Drop a stale preview id that is no longer a real club for this admin.
  useEffect(() => {
    if (!isAdmin || !activeClubId || clubs.length === 0) return;
    if (!clubs.some((c) => c.id === activeClubId)) {
      setActiveClubIdState(null);
      sessionStorage.removeItem(PREVIEW_KEY);
    }
  }, [isAdmin, activeClubId, clubs]);

  const setActiveClubId = (id: string | null) => {
    setActiveClubIdState(id);
    if (typeof window === "undefined") return;
    if (isAdmin) {
      if (id) sessionStorage.setItem(PREVIEW_KEY, id);
      else sessionStorage.removeItem(PREVIEW_KEY);
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  };

  const exitPreview = () => setActiveClubId(null);

  const activeClub = isAdmin
    ? clubs.find((c) => c.id === activeClubId) ?? null
    : clubs.find((c) => c.id === activeClubId) ?? clubs[0] ?? null;

  const optOut = async (clubId: string) => {
    await optOutFn({ data: { clubId } });
    await queryClient.invalidateQueries({ queryKey: ["my-clubs"] });
  };

  return (
    <ClubContext.Provider
      value={{
        clubs,
        activeClub: activeClub ?? null,
        setActiveClubId,
        isLoading: isLoading || rolesLoading,
        optOut,
        isPlatformAdmin: isAdmin,
        isPreviewing: isAdmin && !!activeClub,
        exitPreview,
      }}
    >
      {children}
    </ClubContext.Provider>
  );
}

export function useClub() {
  const ctx = useContext(ClubContext);
  if (!ctx) throw new Error("useClub must be used within ClubProvider");
  return ctx;
}
