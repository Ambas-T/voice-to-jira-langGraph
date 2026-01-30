import * as dotenv from "dotenv";
dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 4000),
  deepgramApiKey: process.env.DEEPGRAM_API_KEY ?? null,
} as const;

export function isDeepgramConfigured(): boolean {
  return Boolean(config.deepgramApiKey);
}
