// email-agent.ts
import * as dotenv from "dotenv";
dotenv.config();

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Resend } from "resend";

// ── Configuration ────────────────────────────────────────────────────────
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

if (!GOOGLE_API_KEY) throw new Error("Missing GOOGLE_API_KEY");
if (!RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");
// ElevenLabs is optional – agent can work without it

const EMAIL_FROM = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

// ── LLM ──────────────────────────────────────────────────────────────────
const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0.6,
  maxOutputTokens: 8192,
  apiKey: GOOGLE_API_KEY,
});

// ── Tools ────────────────────────────────────────────────────────────────

const resend = new Resend(RESEND_API_KEY);

const organizeEmailTool = tool(
  async ({ rawContent, recipientName = "", purpose = "" }) => {
    const prompt = `
Rewrite the following email content into professional, polite business tone.
Keep it concise, clear and well-structured (greeting → body → closing).

${recipientName ? `Recipient: ${recipientName}` : ""}
${purpose ? `Purpose: ${purpose}` : ""}

Raw content:
${rawContent}

Return ONLY the final email text. No explanations.`;
    
    const response = await llm.invoke(prompt);
    return response.content as string;
  },
  {
    name: "organize_email",
    description: "Convert raw messy text into polished, professional email body",
    schema: z.object({
      rawContent: z.string(),
      recipientName: z.string().optional(),
      purpose: z.string().optional(),
    }),
  }
);

const textToSpeechTool = tool(
  async ({ text }) => {
    if (!ELEVENLABS_API_KEY) {
      return "Text-to-speech unavailable: ElevenLabs API key missing";
    }

    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/ZT9u07TYPVl83ejeLakq`,
        {
          method: "POST",
          headers: {
            "Accept": "audio/mpeg",
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_monolingual_v1",
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        }
      );

      if (!response.ok) {
        const err = await response.text();
        return `TTS failed: ${response.status} - ${err}`;
      }

      const bytes = (await response.arrayBuffer()).byteLength;
      return `Voice audio generated successfully (${(bytes / 1024).toFixed(1)} KB)`;
    } catch (err) {
      return `TTS error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
  {
    name: "generate_voice",
    description: "Generate high-quality voice audio from text using ElevenLabs (only when user explicitly asks for voice/audio)",
    schema: z.object({
      text: z.string().describe("Full text content to convert to speech"),
    }),
  }
);

const sendEmailTool = tool(
  async ({ to, subject, content, voice = false }) => {
    let voiceAttachment: { filename: string; content: Buffer } | null = null;
    let voiceNote = "";

    // Generate and attach voice audio if requested
    if (voice && ELEVENLABS_API_KEY) {
      console.log("[Voice] Generating audio for email attachment...");
      try {
        const ttsResponse = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/ZT9u07TYPVl83ejeLakq`,
          {
            method: "POST",
            headers: {
              "Accept": "audio/mpeg",
              "xi-api-key": ELEVENLABS_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: content,
              model_id: "eleven_monolingual_v1",
              voice_settings: { stability: 0.5, similarity_boost: 0.75 },
            }),
          }
        );

        if (ttsResponse.ok) {
          const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());
          voiceAttachment = {
            filename: "voice-message.mp3",
            content: audioBuffer,
          };
          voiceNote = `<div style="margin-top:24px; padding:16px; background:#e0f2fe; border-radius:8px; font-size:13px; color:#0369a1; border-left:4px solid #0ea5e9;">
            <strong>🎧 Voice Message Attached:</strong> Listen to the audio version of this email (voice-message.mp3)
          </div>`;
          console.log(`[Voice] Audio generated: ${(audioBuffer.length / 1024).toFixed(1)} KB`);
        } else {
          const errText = await ttsResponse.text();
          console.error("[Voice] TTS failed:", errText);
          voiceNote = `<div style="margin-top:24px; padding:16px; background:#fef2f2; border-radius:8px; font-size:13px; color:#991b1b;">
            Voice generation failed - email sent without audio.
          </div>`;
        }
      } catch (err) {
        console.error("[Voice] Exception:", err);
      }
    } else if (voice && !ELEVENLABS_API_KEY) {
      voiceNote = `<div style="margin-top:24px; padding:16px; background:#fffbeb; border-radius:8px; font-size:13px; color:#92400e;">
        Voice requested but ElevenLabs API key not configured.
      </div>`;
    }

    const html = `
<div style="font-family: system-ui, sans-serif; max-width:600px; margin:0 auto; padding:28px; background:#ffffff; border:1px solid #e5e7eb; border-radius:10px;">
  <div style="white-space: pre-wrap; line-height:1.65;">${content.replace(/\n/g, "<br>")}</div>
  ${voiceNote}
  <div style="margin-top:32px; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280; text-align:center;">
    Sent via Quartzer AI • ${new Date().toLocaleDateString()}
  </div>
</div>`;

    const emailPayload: Parameters<typeof resend.emails.send>[0] = {
      from: EMAIL_FROM.includes("@resend.dev")
        ? EMAIL_FROM
        : `Quartzer Agent <${EMAIL_FROM}>`,
      to: [to],
      subject,
      html,
    };

    // Add voice attachment if generated
    if (voiceAttachment) {
      emailPayload.attachments = [voiceAttachment];
    }

    const { data, error } = await resend.emails.send(emailPayload);

    if (error) {
      console.error("Resend error:", error);
      return `Failed to send email: ${JSON.stringify(error)}`;
    }

    const voiceStatus = voiceAttachment ? " with voice attachment" : "";
    return `Email successfully sent to ${to}${voiceStatus} • Message ID: ${data?.id ?? "unknown"}`;
  },
  {
    name: "send_email",
    description: `Send the final email with optional voice attachment.
Always use organized/professional content.
Set voice=true when user asks for "voice", "audio", or "voice communication" - this will generate and ATTACH an MP3 audio file.`,
    schema: z.object({
      to: z.string().email(),
      subject: z.string().min(3),
      content: z.string().min(10),
      voice: z.boolean().optional().default(false).describe("Set to true to generate and attach voice audio (MP3) to the email"),
    }),
  }
);

// ── Agent Setup ──────────────────────────────────────────────────────────
const tools = [organizeEmailTool, textToSpeechTool, sendEmailTool];

const agent = createReactAgent({
  llm,
  tools,
  stateModifier: `You are an EmailSender Agent for Quartzer AI.

Workflow:
1. Use organize_email to make raw content professional
2. Use send_email to deliver the email

IMPORTANT - Voice Communication:
- If user mentions "voice", "audio", or "voice communication", set voice=true in send_email
- When voice=true, an MP3 audio file will be automatically generated and ATTACHED to the email
- You do NOT need to call generate_voice separately - send_email handles it internally when voice=true

Rules:
- ALWAYS organize content first with organize_email
- Set voice=true in send_email when user wants voice/audio
- Emails sent from: ${EMAIL_FROM}
- Be professional and concise`,
});

// ── Run Demo ─────────────────────────────────────────────────────────────
async function runDemo() {
  const query = `
Send an email to ambasa.teferra@gmail.com  
Subject: Meeting Follow-up  
Content: Hey, just wanted to follow up on our meeting yesterday. Thanks for the great discussion. Let me know if you have any questions.  
Please use voice communication too.
`.trim();

  console.log("\n┌────────────────────────────────────────────────────┐");
  console.log("│               EMAIL AGENT DEMO                     │");
  console.log("└────────────────────────────────────────────────────┘");
  console.log("\nUser query:\n" + query + "\n");

  try {
    const result = await agent.invoke({
      messages: [{ role: "user", content: query }],
    });

    const finalMessage = result.messages.at(-1);
    const output = finalMessage?.content ?? "No response";

    console.log("\n" + "═".repeat(60));
    console.log("Final Output:");
    console.log(output);
    console.log("═".repeat(60) + "\n");
  } catch (err) {
    console.error("Agent execution failed:", err);
  }
}

// ── Start ────────────────────────────────────────────────────────────────
runDemo().catch(console.error);