import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "../router";
import { BookRoute } from "./BookRoute";
import { Shelf } from "./Shelf";

const shelfRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Shelf,
});

const readRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/read/$releaseId",
  component: Read,
});

// A new ID is a new book: the key gives it a fresh state.
function Read() {
  const { releaseId } = readRoute.useParams();
  return <BookRoute key={releaseId} releaseId={releaseId} />;
}

export const playerRoutes = [shelfRoute, readRoute] as const;
