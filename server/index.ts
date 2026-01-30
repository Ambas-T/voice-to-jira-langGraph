import { config, isDeepgramConfigured } from "./config.js";
import app from "./app.js";

if (!isDeepgramConfigured()) {
  console.warn("Missing DEEPGRAM_API_KEY – /api/transcribe and /api/speak will fail.");
}

app.listen(config.port, () => {
  console.log(`Server running at http://localhost:${config.port}`);
});
