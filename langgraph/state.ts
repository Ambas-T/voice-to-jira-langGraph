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

export interface JiraAgentState {
  topic: string;
  title?: string;
  description?: string;
  acceptanceCriteria?: string[];
  formattedPreview?: string;
  humanApproval?: "approved" | "rejected" | "pending";
  jiraKey?: string;
  jiraUrl?: string;
  error?: string;
  messages: Array<{ role: string; content: string }>;
}

// ── Channel reducers for StateGraph ─────────────────────────────────────────
// Each channel defines how state updates are merged when a node returns partial state.

export const jiraStateChannels = {
  topic: { reducer: (x: string | undefined, y: string | undefined) => y ?? x ?? "" },
  title: { reducer: (x: string | undefined, y: string | undefined) => y ?? x },
  description: { reducer: (x: string | undefined, y: string | undefined) => y ?? x },
  acceptanceCriteria: {
    reducer: (x: string[] | undefined, y: string[] | undefined) => y ?? x,
  },
  formattedPreview: { reducer: (x: string | undefined, y: string | undefined) => y ?? x },
  humanApproval: { reducer: (x: string | undefined, y: string | undefined) => y ?? x },
  jiraKey: { reducer: (x: string | undefined, y: string | undefined) => y ?? x },
  jiraUrl: { reducer: (x: string | undefined, y: string | undefined) => y ?? x },
  error: { reducer: (x: string | undefined, y: string | undefined) => y ?? x },
  messages: {
    reducer: (x: Array<{ role: string; content: string }> | undefined, y: Array<{ role: string; content: string }> | undefined) =>
      [...(x ?? []), ...(y ?? [])],
  },
} as const;
