import { RouterProvider } from "@tanstack/react-router";
import { router } from "@/router";

// The root component: the app router with the Player and Studio routes.
export function App() {
  return <RouterProvider router={router} />;
}
