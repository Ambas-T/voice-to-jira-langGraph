export type Status =
  | "idle"
  | "greeting"
  | "listening"
  | "processing"
  | "review"
  | "creating"
  | "done"
  | "error";

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
  /** When true, generate and create subtasks linked to the parent story */
  createSubtasks?: boolean;
}

export interface JiraResult {
  jiraKey: string;
  jiraUrl: string;
  parentKey?: string;
  parentUrl?: string;
}

export interface HistoryEntry {
  id: number;
  title: string;
  outcome: "approved" | "rejected";
  jiraKey?: string;
  jiraUrl?: string;
  parentKey?: string;
  parentUrl?: string;
  duration: number;
  timestamp: Date;
}

export type CreateJiraResultPayload = Pick<
  JiraResult,
  "jiraKey" | "jiraUrl" | "parentKey" | "parentUrl"
>;

export interface CreatedSubtaskIssue {
  jiraKey: string;
  jiraUrl: string;
}
