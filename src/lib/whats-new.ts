// Release notes — single source of truth for the What's New popup and history.
// Append a new release at the TOP of RELEASES when shipping a major update,
// and bump CURRENT_RELEASE to match its `version`. The popup auto-shows once
// per user per release version (tracked in localStorage).

export type ReleaseItemKind =
  | "challenge"
  | "drill"
  | "game"
  | "feature"
  | "improvement"
  | "bugfix";

export type ReleaseItem = {
  kind: ReleaseItemKind;
  icon: string;
  title: string;
  description: string;
  featured?: boolean;
  link?: { to: string; params?: Record<string, string> };
};

export type Release = {
  version: string;
  date: string; // ISO date
  items: ReleaseItem[];
};

export const RELEASES: Release[] = [
  {
    version: "2026.07.05",
    date: "2026-07-05",
    items: [
      {
        kind: "challenge",
        icon: "🎯",
        title: "Switch 32",
        description:
          "Test your ability to switch between random lengths and forehand/backhand throughout 32 bowls.",
        featured: true,
        link: { to: "/challenge/$slug", params: { slug: "switch-32" } },
      },
    ],
  },
  {
    version: "2026.07.02",
    date: "2026-07-02",
    items: [
      {
        kind: "feature",
        icon: "🏆",
        title: "My Squad",
        description:
          "Connect with bowling mates, compare challenge results and compete on private Squad ladders.",
        featured: true,
        link: { to: "/squad" },
      },
      {
        kind: "feature",
        icon: "🎯",
        title: "Beat A Squad Member",
        description:
          "Launch a challenge directly from a Squad ladder and try to overtake the player above you.",
      },
      {
        kind: "feature",
        icon: "👑",
        title: "Squad Leader & Challenge Champion",
        description:
          "Challenge leaders and overall Squad Championship leaders now receive special recognition.",
      },
      {
        kind: "feature",
        icon: "📈",
        title: "Challenge Ladders",
        description:
          "Each challenge now has a Squad ladder showing best results, achievements and rankings.",
      },
      {
        kind: "feature",
        icon: "🎯",
        title: "Ghost Challenge",
        description:
          "When challenging a Squad member, track whether you are ahead, level or behind their best result.",
      },
      {
        kind: "improvement",
        icon: "📱",
        title: "Visual Scoring Redesign",
        description:
          "Visual scoring now uses a cleaner full-screen layout with numbered bowl markers and end-based scoring.",
      },
      {
        kind: "improvement",
        icon: "🧮",
        title: "BSI Scaling Update",
        description:
          "Draw drill BSI scoring has been adjusted to better recognise strong one-mat accuracy.",
      },
      {
        kind: "bugfix",
        icon: "🎯",
        title: "Drive Then Draw Visual Marker",
        description:
          "Fixed an issue where the visual marker disappeared after placement.",
      },
    ],
  },
  {
    version: "2026.06.25",
    date: "2026-06-25",
    items: [
      {
        kind: "feature",
        icon: "🎯",
        title: "Demo Mode",
        description:
          "Demonstrate the app without affecting your statistics, BSI, history or achievements.",
        featured: true,
      },
      {
        kind: "feature",
        icon: "🗑",
        title: "History Management",
        description:
          "Delete individual drills, challenges and training sessions with password confirmation.",
        featured: true,
      },
      {
        kind: "feature",
        icon: "🏆",
        title: "Challenge Achievement Badges",
        description: "Earn Bronze, Silver, Gold and Platinum achievements.",
      },
      {
        kind: "feature",
        icon: "📈",
        title: "Enhanced Visual Scoring Analytics",
        description: "Track line and weight trends over time.",
      },
      {
        kind: "challenge",
        icon: "🔴",
        title: "SLiMeD",
        description:
          "Master four lengths using forehand and backhand across two rinks.",
        featured: true,
        link: { to: "/challenge/$slug", params: { slug: "slimed" } },
      },
    ],
  },
  {
    version: "2026.06.24",
    date: "2026-06-24",
    items: [
      {
        kind: "improvement",
        icon: "🎯",
        title: "Improved Challenge Tracking",
        description: "Session detail, achievement targets and personal-best progress in one place.",
      },
    ],
  },
];

export const CURRENT_RELEASE = RELEASES[0]?.version ?? "";

const SEEN_KEY = "bowls.whatsNewSeen";
const NEW_BADGE_DAYS = 30;

export function hasSeenCurrentRelease(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(SEEN_KEY) === CURRENT_RELEASE;
  } catch {
    return true;
  }
}

export function hasUnseenRelease(): boolean {
  return !hasSeenCurrentRelease();
}

export function markCurrentReleaseSeen(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SEEN_KEY, CURRENT_RELEASE);
  } catch {
    /* ignore */
  }
}

/** Sort items with featured first, preserving original order otherwise. */
export function sortItems(items: ReleaseItem[]): ReleaseItem[] {
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (Number(!!b.it.featured) - Number(!!a.it.featured)) || (a.i - b.i))
    .map(({ it }) => it);
}

/** Show NEW badge if the item's releaseDate is within NEW_BADGE_DAYS and not completed. */
export function shouldShowNewBadge(opts: {
  releaseDate?: string | null;
  completed?: boolean;
}): boolean {
  if (opts.completed) return false;
  if (!opts.releaseDate) return false;
  const ts = Date.parse(opts.releaseDate);
  if (Number.isNaN(ts)) return false;
  const ageMs = Date.now() - ts;
  return ageMs <= NEW_BADGE_DAYS * 24 * 60 * 60 * 1000;
}

/** Per-slug metadata for content flagged as NEW or FEATURED. */
export type ContentReleaseMeta = {
  releaseDate: string;
  isNew?: boolean;
  isFeatured?: boolean;
};

export const CHALLENGE_RELEASE_META: Record<string, ContentReleaseMeta> = {
  slimed: { releaseDate: "2026-06-24", isNew: true, isFeatured: true },
  "switch-32": { releaseDate: "2026-07-05", isNew: true, isFeatured: true },
};

export const DRILL_RELEASE_META: Record<string, ContentReleaseMeta> = {};

export function getChallengeReleaseMeta(slug: string): ContentReleaseMeta | null {
  return CHALLENGE_RELEASE_META[slug] ?? null;
}

export function getDrillReleaseMeta(slug: string): ContentReleaseMeta | null {
  return DRILL_RELEASE_META[slug] ?? null;
}
