export type TesterPlatform = "ios" | "android";

export const PLATFORM_LABEL: Record<TesterPlatform, string> = {
  ios: "iOS / TestFlight",
  android: "Android / Google Play",
};

export type TesterRow = {
  invitation_id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "coach" | "player";
  invite_code: string;
  invitation_status: "pending" | "used" | "expired" | "revoked";
  platforms: TesterPlatform[];
  ios_install_sent_at: string | null;
  android_install_sent_at: string | null;
  is_tester: boolean;
  notes: string | null;
  expires_at: string;
  created_at: string;
  user_id: string | null;
  account_status: "not_registered" | "active" | "suspended" | "deleted";
  last_sign_in_at: string | null;
};

export function normaliseEmail(email: string) {
  return email.trim().toLowerCase();
}

function storeSteps(platform: TesterPlatform, storeUrl: string) {
  if (platform === "ios") {
    return [
      "1. Install Apple's TestFlight app from the App Store (free).",
      `2. Open the TestFlight invitation you receive from Apple${storeUrl ? ` or use this link: ${storeUrl}` : ""}.`,
      "3. Tap Accept, then Install to get Bowls Trainer.",
    ];
  }
  return [
    "1. Make sure you're signed into the Google Play Store with the email address below.",
    `2. Open the Google Play testing invitation you receive from Google${storeUrl ? ` or use this link: ${storeUrl}` : ""}, then tap \"Become a tester\".`,
    "3. Tap Download on Google Play to install Bowls Trainer.",
  ];
}

/**
 * ONE onboarding message per tester. It covers install AND account in a single
 * communication, so no separate Bowls Trainer registration invite is needed.
 */
export function buildOnboardingMessage(opts: {
  row: Pick<TesterRow, "email" | "full_name" | "invite_code" | "user_id">;
  platform: TesterPlatform;
  storeUrl: string;
  appOrigin: string;
}) {
  const { row, platform, storeUrl, appOrigin } = opts;
  const name = row.full_name?.trim() || "there";
  const hasAccount = !!row.user_id;
  const link = hasAccount
    ? `${appOrigin}/auth`
    : `${appOrigin}/auth?invite=${encodeURIComponent(row.invite_code)}`;

  const accountBlock = hasAccount
    ? [
        "You already have a Bowls Trainer account — there is nothing else to register.",
        `Just open the app and sign in with ${row.email}.`,
        "All your existing data comes with you, on any device or platform.",
      ]
    : [
        "When the app opens, create your Bowls Trainer account using this email address:",
        `  ${row.email}`,
        "",
        "You only register once. If you can't create the account inside the app, use this link:",
        `  ${link}`,
      ];

  return [
    `Hi ${name},`,
    "",
    `You're invited to test Bowls Trainer on ${PLATFORM_LABEL[platform]}.`,
    "",
    "INSTALL THE APP",
    ...storeSteps(platform, storeUrl),
    "",
    "YOUR BOWLS TRAINER ACCOUNT",
    ...accountBlock,
    "",
    `${platform === "ios" ? "TestFlight" : "Google Play"} is only how the app is delivered — it is not a separate Bowls Trainer account.`,
    "You will not receive any other Bowls Trainer registration email.",
    "",
    "Thanks for testing!",
    "The Bowls Trainer team",
  ].join("\n");
}

export function accountStatusLabel(row: TesterRow) {
  if (row.account_status === "not_registered") return "Not registered";
  if (row.account_status === "suspended") return "Suspended";
  if (row.account_status === "deleted") return "Deleted";
  return row.last_sign_in_at ? "Active" : "Registered";
}
