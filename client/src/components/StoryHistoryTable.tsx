import type { HistoryEntry } from "../types";
import { formatTime } from "../utils/formatTime";
import "./StoryHistoryTable.css";

interface StoryHistoryTableProps {
  history: HistoryEntry[];
}

interface HistoryRowProps {
  entry: HistoryEntry;
  rowNumber: number;
  key?: number; // Reserved by React; not used in component
}

function HistoryRow({ entry, rowNumber }: HistoryRowProps) {
  return (
    <tr>
      <td>{rowNumber}</td>
      <td className="story-history-table__title-cell">{entry.title}</td>
      <td>
        <span
          className={`story-history-table__outcome story-history-table__outcome--${entry.outcome}`}
        >
          {entry.outcome === "approved" ? "✓ Approved" : "✗ Rejected"}
        </span>
      </td>
      <td>
        {entry.jiraKey && entry.jiraUrl ? (
          <a
            href={entry.jiraUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="story-history-table__link"
          >
            {entry.jiraKey}
          </a>
        ) : entry.jiraKey ? (
          entry.jiraKey
        ) : (
          "—"
        )}
      </td>
      <td>
        {entry.parentKey && entry.parentUrl ? (
          <a
            href={entry.parentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="story-history-table__link"
          >
            {entry.parentKey}
          </a>
        ) : (
          "—"
        )}
      </td>
      <td>{formatTime(entry.duration)}</td>
      <td>{entry.timestamp.toLocaleTimeString()}</td>
    </tr>
  );
}

export function StoryHistoryTable({ history }: StoryHistoryTableProps) {
  if (history.length === 0) return null;

  return (
    <section className="story-history-section">
      <h2 className="story-history-section__title">Story History</h2>
      <table className="story-history-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Title</th>
            <th>Outcome</th>
            <th>Jira Key</th>
            <th>Parent</th>
            <th>Duration</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {history.map((entry, idx) => (
            <HistoryRow
              key={entry.id}
              entry={entry}
              rowNumber={history.length - idx}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}
