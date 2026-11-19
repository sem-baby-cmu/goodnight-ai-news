// Records what the configured providers return, as one JSON object on stdout.
//
//   pnpm --filter @storybook/models probe:tts          # free: lists the text gateway models
//   pnpm --filter @storybook/models probe:tts --call   # paid: one TTS call and one JSON call
//
// Env comes from the shell, for example `set -a; . ./.env; set +a`.
// Exits 1 only when env is missing.
import { main } from "./probe";

process.exitCode = await main();
