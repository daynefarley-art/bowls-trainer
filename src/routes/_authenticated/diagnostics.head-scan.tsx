import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { HeadScanFlow } from "@/components/bowls/head-scan/HeadScanFlow";
import { isHeadScanAllowedUser } from "@/lib/head-scan-access";

/**
 * HEAD SCAN TEST — isolated diagnostic entry point.
 *
 * Uses the REAL Head Scan implementation. Nothing here starts a drill, creates
 * a result or session, or touches stats, BSI, streaks, achievements or history.
 */
export const Route = createFileRoute("/_authenticated/diagnostics/head-scan")({
  ssr: false,
  beforeLoad: ({ context }) => {
    const user = (context as { user?: { id?: string | null } }).user;
    if (!isHeadScanAllowedUser(user?.id)) {
      throw redirect({ to: "/dashboard" });
    }
  },

  head: () => ({
    meta: [
      { title: "Head Scan Test — Bowls Trainer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HeadScanTestPage,
});

const TEST_BOWLS = [
  { number: 1, hand: "forehand" as const },
  { number: 2, hand: "backhand" as const },
  { number: 3, hand: "forehand" as const },
  { number: 4, hand: "backhand" as const },
];

function HeadScanTestPage() {
  const navigate = useNavigate();
  const [nonce, setNonce] = useState(0);

  return (
    <HeadScanFlow
      key={`diag-scan-${nonce}`}
      endNumber={1}
      bowls={TEST_BOWLS}
      // Camera-model calibration tools: this restricted route only.
      calibration
      onCancel={() => navigate({ to: "/profile" })}
      // Diagnostic only: discard the results and start a fresh scan.
      onComplete={() => setNonce((n) => n + 1)}
    />

  );
}
