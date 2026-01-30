// jira-service.ts - Shared Jira story generation and creation (used by API and jira-agent)
import * as dotenv from "dotenv";
dotenv.config();

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const JIRA_DOMAIN = process.env.JIRA_DOMAIN;
const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY;

if (!GOOGLE_API_KEY) throw new Error("Missing GOOGLE_API_KEY");
if (!JIRA_EMAIL) throw new Error("Missing JIRA_EMAIL");
if (!JIRA_API_TOKEN) throw new Error("Missing JIRA_API_TOKEN");
if (!JIRA_DOMAIN) throw new Error("Missing JIRA_DOMAIN");
if (!JIRA_PROJECT_KEY) throw new Error("Missing JIRA_PROJECT_KEY");

const JIRA_BASE_URL = `https://${JIRA_DOMAIN}.atlassian.net`;

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0.7,
  maxOutputTokens: 4096,
  apiKey: GOOGLE_API_KEY,
});

export interface GeneratedStory {
  title: string;
  description: string;
  acceptanceCriteria: string[];
}

// Optional Jira fields for advanced story creation
export interface JiraOptionalFields {
  parentKey?: string;       // Parent issue key (e.g., "KAN-1")
  dueDate?: string;         // Format: "YYYY-MM-DD"
  startDate?: string;       // Format: "YYYY-MM-DD"  
  labels?: string[];        // Array of label names
  teamId?: string;          // Team ID (for next-gen projects)
}

export interface CreateJiraPayload extends GeneratedStory {
  optionalFields?: JiraOptionalFields | undefined;
}

export interface CreateJiraResult {
  jiraKey: string;
  jiraUrl: string;
  /** When created as sub-task, link to parent issue */
  parentKey?: string;
  parentUrl?: string;
}

export async function generateStory(topic: string): Promise<{ ok: true; story: GeneratedStory } | { ok: false; error: string }> {
  const prompt = `You are a professional Product Manager creating a Jira story.

The user wants a story about: "${topic}"

Create a well-structured Jira story with:

1. **Title** (Summary): A clear, concise story title (max 100 characters)
   - Use action-oriented language
   - Focus on the user value or feature
   - Example: "As a user, I want to filter search results by date"

2. **Description**: A detailed description (2-4 paragraphs) that includes:
   - User story format: "As a [user type], I want [goal] so that [benefit]"
   - Context and background
   - Technical considerations (if relevant)
   - Dependencies or related work

3. **Acceptance Criteria**: A list of 3-6 specific, testable criteria
   - Each criterion should be clear and measurable
   - Format: "Given [condition], when [action], then [result]"

Respond in this exact JSON format:
{
  "title": "Story title here",
  "description": "Full description with user story format and details",
  "acceptanceCriteria": [
    "Criterion 1",
    "Criterion 2",
    "Criterion 3"
  ]
}

Make it professional, clear, and actionable.`;

  try {
    const response = await llm.invoke(prompt);
    const content = response.content as string;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { ok: false, error: "Failed to parse LLM response as JSON" };
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      ok: true,
      story: {
        title: parsed.title || `Story: ${topic}`,
        description: parsed.description || `Story about ${topic}`,
        acceptanceCriteria: Array.isArray(parsed.acceptanceCriteria)
          ? parsed.acceptanceCriteria
          : [parsed.acceptanceCriteria || "Story is complete"].filter(Boolean),
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function getIssueTypes(): Promise<string> {
  try {
    const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
    const response = await fetch(`${JIRA_BASE_URL}/rest/api/3/project/${JIRA_PROJECT_KEY}`, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) return "10001";
    const project = (await response.json()) as {
      issueTypes?: Array<{ name: string; id: string; subtask?: boolean }>;
    };
    if (project.issueTypes) {
      const nonSubtaskTypes = project.issueTypes.filter(
        (it) => !it.subtask && !it.name.toLowerCase().includes("sub")
      );
      const storyType = nonSubtaskTypes.find((it) => it.name.toLowerCase() === "story");
      if (storyType) return storyType.id;
      const taskType = nonSubtaskTypes.find((it) => it.name.toLowerCase() === "task");
      if (taskType) return taskType.id;
      const storyOrTaskType = nonSubtaskTypes.find(
        (it) => it.name.toLowerCase().includes("story") || it.name.toLowerCase().includes("task")
      );
      if (storyOrTaskType) return storyOrTaskType.id;
      const firstType = nonSubtaskTypes[0];
      if (firstType) return firstType.id;
    }
    return "10001";
  } catch {
    return "10001";
  }
}

export async function createJiraStory(payload: CreateJiraPayload): Promise<{ ok: true; result: CreateJiraResult } | { ok: false; error: string }> {
  const { title, description, acceptanceCriteria, optionalFields } = payload;
  if (!title || !description || !acceptanceCriteria?.length) {
    return { ok: false, error: "Missing story content" };
  }
  try {
    const issueTypeId = await getIssueTypes();
    const descriptionParagraphs = description.split("\n\n").filter((p) => p.trim());
    const descriptionContent: Array<Record<string, unknown>> = [];
    descriptionParagraphs.forEach((para) => {
      descriptionContent.push({
        type: "paragraph",
        content: [{ type: "text", text: para.trim() }],
      });
    });
    descriptionContent.push({
      type: "paragraph",
      content: [
        { type: "text", text: "Acceptance Criteria:", marks: [{ type: "strong" }] },
      ],
    });
    acceptanceCriteria.forEach((criteria) => {
      descriptionContent.push({
        type: "paragraph",
        content: [{ type: "text", text: `☐ ${criteria}` }],
      });
    });

    // Build fields object with required and optional fields
    const fields: Record<string, unknown> = {
      project: { key: JIRA_PROJECT_KEY },
      summary: title,
      description: { type: "doc", version: 1, content: descriptionContent },
      issuetype: { id: issueTypeId },
    };

    // Add optional fields if provided
    if (optionalFields) {
      if (optionalFields.parentKey) {
        fields.parent = { key: optionalFields.parentKey };
      }
      if (optionalFields.dueDate) {
        fields.duedate = optionalFields.dueDate;
      }
      if (optionalFields.startDate) {
        // Start date field name varies by Jira instance; commonly "customfield_10015"
        // For next-gen projects, it's often in the "startDate" field
        fields.customfield_10015 = optionalFields.startDate;
      }
      if (optionalFields.labels && optionalFields.labels.length > 0) {
        fields.labels = optionalFields.labels;
      }
      // Team field varies by Jira setup (often a custom field)
      // Skipping teamId as it requires knowing the specific custom field ID
    }

    const issueData = { fields };
    const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
    const response = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(issueData),
    });
    if (!response.ok) {
      const error = await response.text();
      return { ok: false, error: `Jira API error: ${error}` };
    }
    const result = (await response.json()) as { key: string };
    const storyUrl = `${JIRA_BASE_URL}/browse/${result.key}`;
    const createResult: CreateJiraResult = { jiraKey: result.key, jiraUrl: storyUrl };
    if (optionalFields?.parentKey) {
      createResult.parentKey = optionalFields.parentKey;
      createResult.parentUrl = `${JIRA_BASE_URL}/browse/${optionalFields.parentKey}`;
    }
    return { ok: true, result: createResult };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
