import { useState } from "react";
import type { GeneratedStory, JiraResult, Status, JiraOptionalFields, CreatedSubtaskIssue } from "./types";
import "./StoryPreview.css";

interface StoryPreviewProps {
  story: GeneratedStory | null;
  status: Status;
  jiraResult: JiraResult | null;
  subtaskIssues: CreatedSubtaskIssue[] | null;
  creatingSubtasks: boolean;
  subtaskError?: string;
  onApprove: (optionalFields: JiraOptionalFields) => void;
  onReject: () => void;
}

export function StoryPreview({
  story,
  status,
  jiraResult,
  subtaskIssues,
  creatingSubtasks,
  subtaskError,
  onApprove,
  onReject,
}: StoryPreviewProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [parentKey, setParentKey] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [labelsInput, setLabelsInput] = useState("");
  const [createSubtasksChecked, setCreateSubtasksChecked] = useState(false);

  const handleApprove = () => {
    const optionalFields: JiraOptionalFields = {};
    if (parentKey.trim()) optionalFields.parentKey = parentKey.trim();
    if (dueDate) optionalFields.dueDate = dueDate;
    if (startDate) optionalFields.startDate = startDate;
    if (labelsInput.trim()) {
      optionalFields.labels = labelsInput.split(",").map((l) => l.trim()).filter(Boolean);
    }
    if (createSubtasksChecked) {
      optionalFields.createSubtasks = true;
    }
    onApprove(optionalFields);
  };

  if (jiraResult) {
    return (
      <div className="preview-card success-card">
        <h2 className="preview-title">Story created</h2>
        <p className="jira-key">{jiraResult.jiraKey}</p>
        <a href={jiraResult.jiraUrl} target="_blank" rel="noopener noreferrer" className="jira-link">
          Open in Jira →
        </a>
        {jiraResult.parentKey && jiraResult.parentUrl && (
          <a href={jiraResult.parentUrl} target="_blank" rel="noopener noreferrer" className="jira-link parent-link">
            Parent: {jiraResult.parentKey} →
          </a>
        )}
        {subtaskIssues && subtaskIssues.length > 0 && (
          <div className="subtasks-created">
            <h3 className="subtasks-title">Subtasks ({subtaskIssues.length})</h3>
            <ul className="subtasks-list">
              {subtaskIssues.map((issue) => (
                <li key={issue.jiraKey}>
                  <a href={issue.jiraUrl} target="_blank" rel="noopener noreferrer" className="jira-link">
                    {issue.jiraKey} →
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {subtaskError && <p className="subtask-error">{subtaskError}</p>}
      </div>
    );
  }

  if (!story) {
    return (
      <div className="preview-card empty-card">
        <p className="placeholder">Story details will appear here after you speak.</p>
      </div>
    );
  }

  const creating = status === "creating";

  return (
    <div className="preview-card">
      <h2 className="preview-title">Story for review</h2>
      <h3 className="story-title">{story.title}</h3>
      <div className="story-description">{story.description}</div>
      <div className="criteria">
        <strong>Acceptance criteria</strong>
        <ul>
          {story.acceptanceCriteria.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </div>

      <div className="advanced-toggle">
        <button
          type="button"
          className="toggle-btn"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? "▼ Hide" : "▶ Show"} Advanced Options
        </button>
      </div>

      {showAdvanced && (
        <div className="advanced-fields">
          <div className="field-row">
            <label htmlFor="parentKey">Parent Issue</label>
            <input
              id="parentKey"
              type="text"
              placeholder="e.g., KAN-1"
              value={parentKey}
              onChange={(e) => setParentKey(e.target.value)}
              disabled={creating}
            />
          </div>
          <div className="field-row">
            <label htmlFor="dueDate">Due Date</label>
            <input
              id="dueDate"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={creating}
            />
          </div>
          <div className="field-row">
            <label htmlFor="startDate">Start Date</label>
            <input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={creating}
            />
          </div>
          <div className="field-row">
            <label htmlFor="labels">Labels</label>
            <input
              id="labels"
              type="text"
              placeholder="e.g., frontend, bug, urgent"
              value={labelsInput}
              onChange={(e) => setLabelsInput(e.target.value)}
              disabled={creating}
            />
            <span className="field-hint">Comma-separated</span>
          </div>
        </div>
      )}

      {subtaskError && <p className="subtask-error">{subtaskError}</p>}

      <div className="subtasks-checkbox-row">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={createSubtasksChecked}
            onChange={(e) => setCreateSubtasksChecked(e.target.checked)}
            disabled={creating || creatingSubtasks}
          />
          <span>Create subtasks (LLM generates 3–5 child issues)</span>
        </label>
      </div>

      <div className="actions">
        <button
          type="button"
          className="btn-approve"
          onClick={handleApprove}
          disabled={creating || creatingSubtasks}
        >
          {creatingSubtasks ? "Creating subtasks…" : creating ? "Creating…" : "Approve"}
        </button>
        <button
          type="button"
          className="btn-reject"
          onClick={onReject}
          disabled={creating}
        >
          Reject
        </button>
      </div>
    </div>
  );
}
