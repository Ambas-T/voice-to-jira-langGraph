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
