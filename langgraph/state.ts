/**
 * LangGraph state schema and channel reducers for the Jira story workflow.
 * Defines what flows through the graph and how updates are merged.
 */

// ── Shared domain types (used by API and graph) ─────────────────────────────

export interface GeneratedStory {
  title: string;
  description: string;
  acceptanceCriteria: string[];
}

export interface JiraOptionalFields {
  parentKey?: string;
  dueDate?: string;
  startDate?: string;
  labels?: string[];
  teamId?: string;
}

export interface CreateJiraPayload extends GeneratedStory {
  optionalFields?: JiraOptionalFields | undefined;
}

export interface CreateJiraResult {
  jiraKey: string;
  jiraUrl: string;
  parentKey?: string;
  parentUrl?: string;
}

// ── Graph state (Jira agent workflow) ───────────────────────────────────────

/** One subtask (same shape as GeneratedStory). */
export interface SubtaskItem {
  title: string;
  description: string;
  acceptanceCriteria: string[];
}

export interface CreatedSubtaskIssue {
  jiraKey: string;
  jiraUrl: string;
}

export interface JiraAgentState {
  topic: string;
  title?: string;
  description?: string;
  acceptanceCriteria?: string[];
  /** Parent issue key for creating subtasks (set when creating sub-tasks linked to a parent). */
  parentKey?: string;
  /** Populated by generate_subtasks; Pregel fans out over this (Send × N to create_jira). */
  subtasks?: SubtaskItem[];
  /** Aggregated from N create_jira runs (channel reducer concats). */
  createdSubtaskIssues?: CreatedSubtaskIssue[];
  humanApproval?: "approved" | "rejected" | "pending";
  jiraKey?: string;
  jiraUrl?: string;
  error?: string;
  messages: Array<{ role: string; content: string }>;
}

// ── Channel reducers for StateGraph ─────────────────────────────────────────
// Each channel defines how state updates are merged when a node returns partial state.

/** Reducer: new value wins; optional default when both x and y are undefined. */
function replaceReducer<T>(defaultValue?: T): (x: T | undefined, y: T | undefined) => T | undefined {
  return (x, y) => y ?? x ?? defaultValue;
}

const replace = replaceReducer();
const replaceWithDefault = (d: string) => replaceReducer<string>(d);

const appendMessages = (
  x: Array<{ role: string; content: string }> | undefined,
  y: Array<{ role: string; content: string }> | undefined
) => [...(x ?? []), ...(y ?? [])];

/** Concat reducer: each create_jira run pushes one item; Pregel merges. */
const concatCreatedIssues = (
  x: CreatedSubtaskIssue[] | undefined,
  y: CreatedSubtaskIssue[] | CreatedSubtaskIssue | undefined
) => [...(x ?? []), ...(Array.isArray(y) ? y : y ? [y] : [])];

export const jiraStateChannels = {
  topic: { reducer: replaceWithDefault("") },
  title: { reducer: replace },
  description: { reducer: replace },
  acceptanceCriteria: { reducer: replace },
  parentKey: { reducer: replace },
  subtasks: { reducer: replace },
  createdSubtaskIssues: { reducer: concatCreatedIssues },
  humanApproval: { reducer: replace },
  jiraKey: { reducer: replace },
  jiraUrl: { reducer: replace },
  error: { reducer: replace },
  messages: { reducer: appendMessages },
} as const;
