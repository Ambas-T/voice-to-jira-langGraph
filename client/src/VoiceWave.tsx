import "./VoiceWave.css";

interface VoiceWaveProps {
  active: boolean;
}

export function VoiceWave({ active }: VoiceWaveProps) {
  return (
    <div className={`voice-wave ${active ? "active" : ""}`} aria-hidden>
      {Array.from({ length: 12 }).map((_, i) => (
        <span key={i} className="bar" style={{ animationDelay: `${i * 0.05}s` }} />
      ))}
    </div>
  );
}
