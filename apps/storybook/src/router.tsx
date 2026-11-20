import {
  createRootRoute,
  createRouter,
  Navigate,
  Outlet,
  type RouterHistory,
  useLocation,
} from "@tanstack/react-router";
import { playerRoutes } from "./player/routes";
import { spikeRoutes } from "./spike/routes";
import { studioRoutes } from "./studio/routes";

// Code-based routes in one tree. Only this file imports the route files of
// the Player and the Studio. They read `rootRoute` only inside
// `getParentRoute`, so this file must load first: import `router` or
// `rootRoute` from "@/router", never a route file.

function RootLayout() {
  return <Outlet />;
}

// A path that matches no route: under /studio/ to the Studio, else to the
// shelf, with the history entry replaced (design "9", Unknown path).
function NotFound() {
  const { pathname } = useLocation();
  return pathname.startsWith("/studio/") ? <Navigate to="/studio" replace /> : <Navigate to="/" replace />;
}

export const rootRoute = createRootRoute({ component: RootLayout, notFoundComponent: NotFound });

const routeTree = rootRoute.addChildren([...playerRoutes, ...studioRoutes, ...spikeRoutes]);

// `notFoundMode: "root"`: every unknown path uses the root not-found
// component, also below a matched route (`/read/<id>/more`).
export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, history, notFoundMode: "root" });
}

export const router = createAppRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
