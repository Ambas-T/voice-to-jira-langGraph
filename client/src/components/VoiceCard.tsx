import { VoiceWave } from "../VoiceWave";
import type { Status } from "../types";
import "./VoiceCard.css";

interface VoiceCardProps {
  status: Status;
  transcript: string;
  error: string;
  onCreateStory: () => void;
  onStopListening: () => void;
  onTryAgain: () => void;
  onCreateAnother: () => void;
}

export function VoiceCard({
  status,
  transcript,
  error,
  onCreateStory,
  onStopListening,
  onTryAgain,
  onCreateAnother,
}: VoiceCardProps) {
  const isListening = status === "listening";
  const showWave =
    status === "greeting" || status === "listening" || status === "processing";
  const showTranscript =
    !!transcript &&
    status !== "review" &&
    status !== "creating" &&
    status !== "done";

  return (
    <div className="voice-card">
      {status === "idle" && (
        <button
          type="button"
          className="voice-card__btn voice-card__btn--primary"
          onClick={onCreateStory}
        >
          Create Jira story
        </button>
      )}

      {(status === "greeting" || status === "listening") && (
        <button
          type="button"
          className="voice-card__btn voice-card__btn--stop"
          onClick={onStopListening}
          disabled={status !== "listening"}
        >
          {status === "listening" ? "Stop listening" : "Playing…"}
        </button>
      )}

      {showWave && <VoiceWave active={isListening} />}

      {status === "processing" && (
        <p className="voice-card__status">Processing your idea…</p>
      )}

      {showTranscript && (
        <p className="voice-card__transcript">You said: "{transcript}"</p>
      )}

      {error && (
        <div className="voice-card__error-wrap">
          <p className="voice-card__error">{error}</p>
          <button
            type="button"
            className="voice-card__btn voice-card__btn--secondary"
            onClick={onTryAgain}
          >
            Try Again
          </button>
        </div>
      )}

      {status === "done" && (
        <button
          type="button"
          className="voice-card__btn voice-card__btn--primary"
          onClick={onCreateAnother}
        >
          Create Another Story
        </button>
      )}
    </div>
  );
}
