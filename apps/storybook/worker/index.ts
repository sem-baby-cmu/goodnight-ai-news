import { app } from "./api/app";

export { StoryRunWorkflow } from "./workflow/story-run";

// The Studio API, the content route, and GET /health live in `api/app.ts`.
export default { fetch: app.fetch };
