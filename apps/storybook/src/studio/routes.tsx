import { createRoute, Outlet, redirect } from "@tanstack/react-router";
import { rootRoute } from "../router";
import { StoryListPage } from "./StoryListPage";
import { StoryPage } from "./StoryPage";
import { StudioHeader } from "./StudioHeader";

// The Studio routes under /studio (#23, Exact changes 3).

const studioLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/studio",
  component: StudioLayout,
});

function StudioLayout() {
  return (
    <div className="min-h-screen bg-desk text-ink">
      <StudioHeader />
      <main className="mx-auto max-w-[1408px] px-6 pt-6 pb-12">
        <Outlet />
      </main>
    </div>
  );
}

const studioIndexRoute = createRoute({
  getParentRoute: () => studioLayoutRoute,
  path: "/",
  component: StoryListPage,
});

const storyRoute = createRoute({
  getParentRoute: () => studioLayoutRoute,
  path: "stories/$storyId",
  validateSearch: (s: Record<string, unknown>): { runId?: string } => ({
    runId: typeof s.runId === "string" ? s.runId : undefined,
  }),
  component: StoryRouteView,
});

function StoryRouteView() {
  const { storyId } = storyRoute.useParams();
  const { runId } = storyRoute.useSearch();
  return <StoryPage key={storyId} storyId={storyId} runId={runId} />;
}

// A path under /studio that matches no Studio route shows the stories list at
// /studio, with no new history entry (SYS-03.S3; ADR 0017 decision 21).
const studioFallbackRoute = createRoute({
  getParentRoute: () => studioLayoutRoute,
  path: "$",
  beforeLoad: () => {
    throw redirect({ to: "/studio", replace: true });
  },
});

export const studioRoutes = [
  studioLayoutRoute.addChildren([studioIndexRoute, storyRoute, studioFallbackRoute]),
] as const;
