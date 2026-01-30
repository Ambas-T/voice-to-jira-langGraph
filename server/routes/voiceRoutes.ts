import { Router } from "express";
import type { Request, Response } from "express";
import { upload } from "../middleware/upload.js";
import * as deepgram from "../services/deepgram.js";
import { config } from "../config.js";

const router = Router();

interface SpeakBody {
  text?: string;
}

type RequestWithFile = Request & {
  file?: { buffer: Buffer; mimetype: string };
};

router.post("/transcribe", upload.single("audio"), async (req: Request, res: Response) => {
  if (!config.deepgramApiKey) {
    res.status(503).json({ error: "Deepgram not configured" });
    return;
  }
  const file = (req as RequestWithFile).file;
  if (!file?.buffer) {
    res.status(400).json({ error: "No audio file (field: audio)" });
    return;
  }

  const result = await deepgram.transcribe(file.buffer);
  if ("error" in result) {
    res.status(500).json({ error: result.error });
  } else {
    res.json({ transcript: result.transcript });
  }
});

router.post("/speak", async (req: Request, res: Response) => {
  if (!config.deepgramApiKey) {
    res.status(503).json({ error: "Deepgram not configured" });
    return;
  }
  const { text } = req.body as SpeakBody;
  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "Missing or invalid text" });
    return;
  }

  const result = await deepgram.speak(text.trim());
  if ("error" in result) {
    res.status(500).json({ error: result.error });
  } else {
    res.setHeader("Content-Type", "audio/mpeg");
    res.send(result.audio);
  }
});

export default router;
