import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "../router";

// The S1 spike route (issue #15). `import.meta.env.DEV` and
// `import.meta.env.VITE_SPIKE` are replaced by literals in a build, so a
// normal build folds the condition to `false` and drops the route, the lazy
// import, and `SpikePage` with its asset paths. Keep the route inside the
// condition: a `createRoute` call outside it has side effects and stays.
export const spikeRoutes =
  import.meta.env.DEV || import.meta.env.VITE_SPIKE === "1"
    ? [
        createRoute({
          getParentRoute: () => rootRoute,
          path: "/spike/$n",
          // The router writes `probe` back as `true`, so accept that form as well as `1`.
          validateSearch: (search: Record<string, unknown>) => ({
            probe: search.probe === true || search.probe === 1 || search.probe === "1",
          }),
          component: lazyRouteComponent(() => import("./SpikeRoute")),
        }),
      ]
    : [];
