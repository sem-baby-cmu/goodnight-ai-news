import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "../router";

// Placeholder. #23 replaces the component and adds the Studio routes.
const studioIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/studio",
  component: StudioPlaceholder,
});

function StudioPlaceholder() {
  return (
    <main data-testid="studio-placeholder" className="p-4">
      <h1 className="font-display text-2xl">Studio</h1>
    </main>
  );
}

export const studioRoutes = [studioIndexRoute] as const;
