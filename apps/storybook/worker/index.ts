import { Hono } from "hono";

export { StoryRunWorkflow } from "./workflow/story-run";

const app = new Hono<{ Bindings: Env }>();

// Deploy checks this route (ADR 0011).
app.get("/health", (c) => c.text("ok"));

export default app;
