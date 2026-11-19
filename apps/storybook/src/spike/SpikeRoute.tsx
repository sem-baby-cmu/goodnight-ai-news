import { getRouteApi } from "@tanstack/react-router";
import { SpikePage } from "./SpikePage";

const api = getRouteApi("/spike/$n");

// Reads the route params for `SpikePage`. Loaded lazily by `routes.tsx`.
export default function SpikeRoute() {
  const { n } = api.useParams();
  const { probe } = api.useSearch();
  return <SpikePage n={n} probe={probe} />;
}
