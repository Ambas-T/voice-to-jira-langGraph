import { config } from "../config.js";

const STT_URL = "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true";
const TTS_URL = "https://api.deepgram.com/v1/speak?model=aura-asteria-en";

export type TranscribeResult = { transcript: string } | { error: string };
export type SpeakResult = { audio: Buffer } | { error: string };

export async function transcribe(audioBuffer: Buffer): Promise<TranscribeResult> {
  const apiKey = config.deepgramApiKey;
  if (!apiKey) {
    return { error: "Deepgram not configured" };
  }
  try {
    const response = await fetch(STT_URL, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "audio/webm",
      },
      body: audioBuffer as unknown as BodyInit,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Deepgram STT error:", response.status, errText);
      return { error: `Deepgram STT failed: ${response.status}` };
    }

    const data = (await response.json()) as {
      results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> };
    };
    const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
    return { transcript };
  } catch (err) {
    console.error("Deepgram STT exception:", err);
    return { error: err instanceof Error ? err.message : "Transcription failed" };
  }
}

export async function speak(text: string): Promise<SpeakResult> {
  const apiKey = config.deepgramApiKey;
  if (!apiKey) {
    return { error: "Deepgram not configured" };
  }
  try {
    const response = await fetch(TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Deepgram TTS error:", response.status, errText);
      return { error: `Deepgram TTS failed: ${response.status}` };
    }

    const arrayBuffer = await response.arrayBuffer();
    return { audio: Buffer.from(arrayBuffer) };
  } catch (err) {
    console.error("Deepgram TTS exception:", err);
    return { error: err instanceof Error ? err.message : "TTS failed" };
  }
}
