import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/squad")({
  component: SquadLayout,
});

function SquadLayout() {
  return <Outlet />;
}