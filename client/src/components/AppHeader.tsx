import { Stopwatch } from "./Stopwatch";
import "./AppHeader.css";

interface AppHeaderProps {
  title?: string;
  subtitle?: string;
  showStopwatch?: boolean;
  elapsedSeconds?: number;
}

export function AppHeader({
  title = "Voice to Jira",
  subtitle = "Describe your story — approve to create in Jira",
  showStopwatch = false,
  elapsedSeconds = 0,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <h1 className="app-header__title">{title}</h1>
      <p className="app-header__subtitle">{subtitle}</p>
      {showStopwatch && <Stopwatch elapsedSeconds={elapsedSeconds} />}
    </header>
  );
}
