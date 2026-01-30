import { formatTime } from "../utils/formatTime";
import "./Stopwatch.css";

interface StopwatchProps {
  elapsedSeconds: number;
}

export function Stopwatch({ elapsedSeconds }: StopwatchProps) {
  return (
    <div className="stopwatch">
      <span className="stopwatch-icon" aria-hidden>⏱</span>
      <span className="stopwatch-time">{formatTime(elapsedSeconds)}</span>
    </div>
  );
}
