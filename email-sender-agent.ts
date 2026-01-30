// email-sender-agent.ts - One-Shot Voice Email Agent
import * as dotenv from "dotenv";
dotenv.config();

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { Resend } from "resend";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";

// ── Configuration ────────────────────────────────────────────────────────
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "ZT9u07TYPVl83ejeLakq";
const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL || "ambasa.teferra@gmail.com";

if (!GOOGLE_API_KEY) throw new Error("Missing GOOGLE_API_KEY");
if (!RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");
if (!ELEVENLABS_API_KEY) throw new Error("Missing ELEVENLABS_API_KEY for voice features");

const EMAIL_FROM = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

// ── LLM ──────────────────────────────────────────────────────────────────
const llm = new ChatGoogleGenerativeAI({
  model: "gemini-3-flash-preview",
  temperature: 0.7,
  maxOutputTokens: 4096,
  apiKey: GOOGLE_API_KEY,
});

// ── Resend ───────────────────────────────────────────────────────────────
const resend = new Resend(RESEND_API_KEY);

// ── Record Voice Input ───────────────────────────────────────────────────
async function recordVoice(seconds: number = 7): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const tempFile = path.join(process.cwd(), `recording_${Date.now()}.wav`);
    const isWindows = process.platform === "win32";

    console.log(`\n🎤 SPEAK NOW! Recording for ${seconds} seconds...`);

    if (isWindows) {
      // Windows: Use PowerShell with Windows Speech Recognition
      const psScript = `
        Add-Type -AssemblyName System.Speech
        $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
        $recognizer.SetInputToDefaultAudioDevice()
        $grammar = New-Object System.Speech.Recognition.DictationGrammar
        $recognizer.LoadGrammar($grammar)
        $result = $recognizer.Recognize([TimeSpan]::FromSeconds(${seconds}))
        if ($result) { $result.Text } else { "could not understand" }
      `;
      const proc = spawn("powershell", ["-Command", psScript]);
      let output = "";
      proc.stdout?.on("data", (d) => (output += d.toString()));
      proc.stderr?.on("data", (d) => console.error(d.toString()));
      proc.on("close", () => resolve(Buffer.from(output.trim() || "random topic", "utf-8")));
      proc.on("error", reject);
    } else {
      // macOS/Linux: Use sox
      const proc = spawn("sox", ["-d", "-t", "wav", "-r", "16000", "-c", "1", tempFile, "trim", "0", String(seconds)]);
      proc.on("close", () => {
        if (fs.existsSync(tempFile)) {
          const buf = fs.readFileSync(tempFile);
          fs.unlinkSync(tempFile);
          resolve(buf);
        } else {
          reject(new Error("Recording failed"));
        }
      });
      proc.on("error", reject);
    }

    setTimeout(() => console.log("⏱️  Recording complete."), seconds * 1000);
  });
}

// ── Transcribe Voice (ElevenLabs STT) ────────────────────────────────────
async function transcribeVoice(audioBuffer: Buffer): Promise<string> {
  // Check if it's already text (Windows Speech Recognition returns text directly)
  const maybeText = audioBuffer.toString("utf-8");
  if (maybeText && !maybeText.includes("\x00") && maybeText.length < 500) {
    console.log(`📝 Transcribed: "${maybeText}"`);
    return maybeText;
  }

  console.log("📝 Transcribing with ElevenLabs...");

  const formData = new FormData();
  const arrayBuffer = audioBuffer.buffer.slice(
    audioBuffer.byteOffset,
    audioBuffer.byteOffset + audioBuffer.byteLength
  ) as ArrayBuffer;
  formData.append("audio", new Blob([arrayBuffer], { type: "audio/wav" }), "recording.wav");
  formData.append("model_id", "scribe_v1");

  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": ELEVENLABS_API_KEY! },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Transcription failed: ${err}`);
  }

  const result = (await response.json()) as { text?: string };
  const text = result.text || "general topic";
  console.log(`📝 Transcribed: "${text}"`);
  return text;
}

// ── Generate Email Content with LLM ──────────────────────────────────────
async function generateEmailContent(topic: string): Promise<{ subject: string; body: string; interpretation: string }> {
  console.log(`\n🤖 Generating email about: "${topic}"...`);

  const prompt = `The user said: "${topic}"

Your task:
1. Interpret what they might want an email about
2. Generate a professional, informative email on that topic

If the topic is unclear or random, make your best interpretation and state it clearly.

Respond in this exact JSON format:
{
  "interpretation": "I think you want an email about [your interpretation]",
  "subject": "Email subject line here",
  "body": "Full professional email body here with greeting, content, and closing. Make it informative and well-written."
}

Keep the email body informative (1 paragraph) and professional.`;

  const response = await llm.invoke(prompt);
  const content = response.content as string;

  // Extract JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      interpretation: `I'll write about: ${topic}`,
      subject: `Information about ${topic}`,
      body: content,
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      interpretation: parsed.interpretation || `Writing about: ${topic}`,
      subject: parsed.subject || `Information about ${topic}`,
      body: parsed.body || content,
    };
  } catch {
    return {
      interpretation: `I'll write about: ${topic}`,
      subject: `Information about ${topic}`,
      body: content,
    };
  }
}

// ── Generate Voice from Text (ElevenLabs TTS) ────────────────────────────
async function generateVoice(text: string): Promise<Buffer> {
  console.log("🔊 Generating voice audio...");

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    {
      method: "POST",
      headers: {
        Accept: "audio/mpeg",
        "xi-api-key": ELEVENLABS_API_KEY!,
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
    throw new Error(`TTS failed: ${await response.text()}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  console.log(`🔊 Voice generated: ${(buffer.length / 1024).toFixed(1)} KB`);
  return buffer;
}

// ── Play Audio Locally ───────────────────────────────────────────────────
async function playAudio(audioBuffer: Buffer): Promise<void> {
  const tempFile = path.join(process.cwd(), `playback_${Date.now()}.mp3`);
  fs.writeFileSync(tempFile, audioBuffer);

  return new Promise((resolve) => {
    const isWindows = process.platform === "win32";
    if (isWindows) {
      const proc = spawn("powershell", [
        "-Command",
        `(New-Object Media.SoundPlayer '${tempFile}').PlaySync(); Remove-Item '${tempFile}'`,
      ]);
      proc.on("close", () => resolve());
    } else {
      const proc = spawn("afplay", [tempFile]);
      proc.on("close", () => {
        fs.unlinkSync(tempFile);
        resolve();
      });
    }
  });
}

// ── Send Email with Text + Voice ─────────────────────────────────────────
async function sendEmail(
  to: string,
  subject: string,
  textContent: string,
  voiceBuffer: Buffer
): Promise<string> {
  console.log(`\n📧 Sending email to ${to}...`);

  const html = `
<div style="font-family: 'Segoe UI', system-ui, sans-serif; max-width:650px; margin:0 auto; padding:32px; background:linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius:16px;">
  <div style="background:#ffffff; border-radius:12px; padding:32px; box-shadow: 0 10px 40px rgba(0,0,0,0.15);">
    <div style="white-space: pre-wrap; line-height:1.7; color:#1f2937; font-size:15px;">
${textContent.replace(/\n/g, "<br>")}
    </div>
    
    <div style="margin-top:28px; padding:20px; background:linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 100%); border-radius:10px; border-left:4px solid #0ea5e9;">
      <div style="font-size:14px; color:#0369a1; font-weight:600;">
        🎧 Voice Message Attached
      </div>
      <div style="font-size:13px; color:#0c4a6e; margin-top:6px;">
        Listen to the audio version of this email: <strong>voice-message.mp3</strong>
      </div>
    </div>
    
    <div style="margin-top:32px; padding-top:24px; border-top:1px solid #e5e7eb; text-align:center;">
      <div style="font-size:12px; color:#9ca3af;">
        Sent via <strong style="color:#6366f1;">Quartzer AI</strong> Voice Email Agent
      </div>
      <div style="font-size:11px; color:#d1d5db; margin-top:4px;">
        ${new Date().toLocaleString()}
      </div>
    </div>
  </div>
</div>`;

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM.includes("@resend.dev") ? EMAIL_FROM : `Quartzer AI <${EMAIL_FROM}>`,
    to: [to],
    subject,
    html,
    attachments: [{ filename: "voice-message.mp3", content: voiceBuffer }],
  });

  if (error) {
    throw new Error(`Email failed: ${JSON.stringify(error)}`);
  }

  return data?.id || "sent";
}

// ── Main Flow ────────────────────────────────────────────────────────────
async function main() {
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║     🎤 QUARTZER VOICE EMAIL AGENT                         ║");
  console.log("║     Speak once → AI writes → Voice + Email sent           ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  console.log(`📬 Email will be sent to: ${RECIPIENT_EMAIL}`);
  console.log(`📤 Email will be sent from: ${EMAIL_FROM}\n`);

  // Step 1: Ask and Record
  console.log("💬 What email do you want me to send?");
  console.log("   (Say anything: a topic, a question, random words...)\n");

  const readline = await import("node:readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const userInput = await new Promise<string>((resolve) => {
    rl.question("Press ENTER to start speaking (or type something): ", async (typed) => {
      rl.close();
      if (typed.trim()) {
        resolve(typed.trim());
      } else {
        try {
          const audio = await recordVoice(7);
          const text = await transcribeVoice(audio);
          resolve(text);
        } catch (err) {
          console.error("Recording error, using default topic");
          resolve("interesting technology news");
        }
      }
    });
  });

  // Step 2: Generate email content with LLM
  const { interpretation, subject, body } = await generateEmailContent(userInput);

  console.log(`\n💡 ${interpretation}`);
  console.log(`\n📋 Subject: ${subject}`);
  console.log(`\n📄 Email Preview:\n${"─".repeat(50)}`);
  console.log(body);
  console.log("─".repeat(50));

  // Step 3: Generate voice from email content
  const voiceBuffer = await generateVoice(body);

  // Step 4: Play the voice locally so user can hear
  console.log("\n🔊 Playing voice preview...");
  await playAudio(voiceBuffer);

  // Step 5: Send email with both text and voice
  const emailId = await sendEmail(RECIPIENT_EMAIL, subject, body, voiceBuffer);

  console.log("\n✅ ════════════════════════════════════════════════════════");
  console.log(`   EMAIL SENT SUCCESSFULLY!`);
  console.log(`   📧 To: ${RECIPIENT_EMAIL}`);
  console.log(`   📋 Subject: ${subject}`);
  console.log(`   🎧 Voice attachment: voice-message.mp3`);
  console.log(`   🆔 Message ID: ${emailId}`);
  console.log("════════════════════════════════════════════════════════════\n");
}

// ── Run ──────────────────────────────────────────────────────────────────
 
