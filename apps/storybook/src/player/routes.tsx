import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "../router";

// Placeholder. #22 replaces the component with the Player.
const readRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/read/$releaseId",
  component: ReadPlaceholder,
});

function ReadPlaceholder() {
  const { releaseId } = readRoute.useParams();
  return <main data-testid="player-placeholder" data-release-id={releaseId} />;
}

export const playerRoutes = [readRoute] as const;
