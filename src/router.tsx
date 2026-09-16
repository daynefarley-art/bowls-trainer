import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { AppLoadingScreen } from "./components/bowls/AppLoadingScreen";
import { StartupErrorScreen } from "./components/bowls/StartupErrorScreen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Never show an empty page while a route resolves (slow mobile network,
    // pending auth check) — show branded loading instead.
    defaultPendingComponent: AppLoadingScreen,
    defaultPendingMs: 150,
    defaultPendingMinMs: 300,
    defaultErrorComponent: StartupErrorScreen,
  });

  return router;
};
