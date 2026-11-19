import { createRootRoute, createRouter, Outlet } from "@tanstack/react-router";
import { playerRoutes } from "./player/routes";
import { studioRoutes } from "./studio/routes";

// Code-based routes in one tree. Only this file imports the route files of
// the Player and the Studio. They read `rootRoute` only inside
// `getParentRoute`, so this file must load first: import `router` or
// `rootRoute` from "@/router", never a route file.

function RootLayout() {
  return <Outlet />;
}

export const rootRoute = createRootRoute({ component: RootLayout });

export const router = createRouter({
  routeTree: rootRoute.addChildren([...playerRoutes, ...studioRoutes]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
