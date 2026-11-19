import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

// Deploy checks this route (ADR 0011).
app.get("/health", (c) => c.text("ok"));

export default app;
