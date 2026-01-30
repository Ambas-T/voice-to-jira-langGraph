import { useState, useRef, useCallback } from "react";
import { AppHeader, VoiceCard, StoryHistoryTable } from "./components";
import { StoryPreview } from "./StoryPreview";
import { useStopwatch } from "./hooks/useStopwatch";
import type {
  Status,
  GeneratedStory,
  JiraOptionalFields,
  JiraResult,
  HistoryEntry,
  CreateJiraResultPayload,
} from "./types";
import "./App.css";

const API = ""; // same origin via Vite proxy

export type { Status, GeneratedStory, JiraOptionalFields, JiraResult, HistoryEntry };

export default function App() {
  const [status, setStatus] = useState<Status>("idle");
  const [story, setStory] = useState<GeneratedStory | null>(null);
  const [transcript, setTranscript] = useState("");
  const [jiraResult, setJiraResult] = useState<JiraResult | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const historyIdRef = useRef(1);

  const { elapsedTime, start, reset, getDuration, showStopwatch } = useStopwatch(status);

  const playGreeting = useCallback(async () => {
    setError("");
    setStatus("greeting");
    start();
    try {
      const res = await fetch(`${API}/api/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Hi, what Jira story do you want to build?" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to play greeting");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = () => reject(new Error("Audio playback failed"));
        audio.play().catch(reject);
      });
      startListening();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Greeting failed");
      setStatus("error");
    }
  }, []);

  const startListening = useCallback(async () => {
    setError("");
    setTranscript("");
    setStory(null);
    setJiraResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && chunksRef.current) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setStatus("processing");
        try {
          const chunks = chunksRef.current ?? [];
          const blob = new Blob(chunks, { type: "audio/webm" });
          const form = new FormData();
          form.append("audio", blob, "audio.webm");
          const res = await fetch(`${API}/api/transcribe`, { method: "POST", body: form });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Transcription failed");
          }
          const { transcript: text } = await res.json();
          setTranscript(text || "");
          if (!text?.trim()) {
            setError("No speech detected. Try again.");
            setStatus("error");
            return;
          }
          const storyRes = await fetch(`${API}/api/generate-story`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topic: text.trim() }),
          });
          if (!storyRes.ok) {
            const data = await storyRes.json().catch(() => ({}));
            throw new Error(data.error || "Story generation failed");
          }
          const { story: generated } = await storyRes.json();
          setStory(generated);
          setStatus("review");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Processing failed");
          setStatus("error");
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setStatus("listening");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone access failed");
      setStatus("error");
    }
  }, []);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
      mediaRecorderRef.current = null;
    }
  }, []);

  const handleCreateStory = useCallback(() => {
    setError("");
    setStory(null);
    setJiraResult(null);
    setTranscript("");
    playGreeting();
  }, [playGreeting]);

  const addToHistory = useCallback(
    (title: string, outcome: "approved" | "rejected", result?: CreateJiraResultPayload) => {
      const duration = getDuration();
      const id = historyIdRef.current ?? 1;
      historyIdRef.current = id + 1;
      setHistory((prev) => [
        {
          id,
          title,
          outcome,
          jiraKey: result?.jiraKey,
          jiraUrl: result?.jiraUrl,
          parentKey: result?.parentKey,
          parentUrl: result?.parentUrl,
          duration,
          timestamp: new Date(),
        },
        ...prev,
      ]);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [getDuration]
  ) as (title: string, outcome: "approved" | "rejected", result?: CreateJiraResultPayload) => void;

  const handleApprove = useCallback(
    async (fields: JiraOptionalFields) => {
      if (!story) return;
      setError("");
      setStatus("creating");
      try {
        const res = await fetch(`${API}/api/create-jira`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...story, optionalFields: fields }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to create Jira story");
        }
        const result = await res.json();
        setJiraResult(result);
        addToHistory(story.title, "approved", result);
        setStatus("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Create failed");
        setStatus("error");
      }
    },
    [story, addToHistory]
  ) as (fields: JiraOptionalFields) => Promise<void>;

  const handleReject = useCallback(() => {
    if (story) addToHistory(story.title, "rejected");
    setStory(null);
    setStatus("idle");
    setTranscript("");
    reset();
  }, [story, addToHistory, reset]);

  const handleCreateAnother = useCallback(() => {
    setStory(null);
    setJiraResult(null);
    setTranscript("");
    setError("");
    reset();
    setStatus("idle");
  }, [reset]);

  const handleTryAgain = handleCreateAnother;

  return (
    <div className="app">
      <AppHeader
        showStopwatch={showStopwatch}
        elapsedSeconds={elapsedTime}
      />
      <div className="app__layout">
        <section className="app__voice-section">
          <VoiceCard
            status={status}
            transcript={transcript}
            error={error}
            onCreateStory={handleCreateStory}
            onStopListening={stopListening}
            onTryAgain={handleTryAgain}
            onCreateAnother={handleCreateAnother}
          />
        </section>
        <section className="app__preview-section">
          <StoryPreview
            story={story}
            status={status}
            jiraResult={jiraResult}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        </section>
      </div>
      <StoryHistoryTable history={history} />
    </div>
  );
}
