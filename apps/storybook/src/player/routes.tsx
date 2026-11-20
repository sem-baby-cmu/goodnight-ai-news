import { createRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { rootRoute } from "../router";
import { BookRoute } from "./BookRoute";

// Placeholder. #77 replaces the component with the shelf.
const shelfRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ShelfPlaceholder,
});

function ShelfPlaceholder() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return <main ref={ref} tabIndex={-1} data-testid="shelf-placeholder" className="min-h-dvh bg-desk" />;
}

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
