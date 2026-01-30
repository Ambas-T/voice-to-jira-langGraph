/**
 * Story generation service: LLM-based creation of Jira story (title, description, acceptance criteria).
 * Used by the LangGraph generate_story node and by the voice-to-Jira API.
 */
import * as dotenv from "dotenv";
dotenv.config();

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { GeneratedStory, SubtaskItem } from "../state.js";

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
if (!GOOGLE_API_KEY) throw new Error("Missing GOOGLE_API_KEY");

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0.7,
  maxOutputTokens: 4096,
  apiKey: GOOGLE_API_KEY,
});

const STORY_PROMPT = `You are a professional Product Manager creating a Jira story.

The user wants a story about: "{{topic}}"

Create a well-structured Jira story with:

1. **Title** (Summary): A clear, concise story title (max 100 characters)
   - Use action-oriented language
   - Focus on the user value or feature
   - Example: "As a user, I want to filter search results by date"

2. **Description**: A detailed description (1 - 3 paragraphs) that includes:
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

export async function generateStory(
  topic: string
): Promise<{ ok: true; story: GeneratedStory } | { ok: false; error: string }> {
  const prompt = STORY_PROMPT.replace("{{topic}}", topic);
  try {
    const response = await llm.invoke(prompt);
    const content = response.content as string;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { ok: false, error: "Failed to parse LLM response as JSON" };
    }
    const parsed = JSON.parse(jsonMatch[0]) as {
      title?: string;
      description?: string;
      acceptanceCriteria?: string[] | string;
    };
    return {
      ok: true,
      story: {
        title: parsed.title ?? `Story: ${topic}`,
        description: parsed.description ?? `Story about ${topic}`,
        acceptanceCriteria: Array.isArray(parsed.acceptanceCriteria)
          ? parsed.acceptanceCriteria
          : [parsed.acceptanceCriteria ?? "Story is complete"].filter(Boolean),
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

const SUBTASKS_PROMPT = `You are a Product Manager splitting a parent story into subtasks.

Parent story:
Title: {{title}}
Description: {{description}}
Acceptance criteria: {{acceptanceCriteria}}

Decide how many subtasks this story needs: 3, 4, or 5. Generate exactly that many subtasks.
Each subtask must be a concrete, shippable piece of work with its own title, short description, and 1–3 acceptance criteria.

Respond with ONLY a JSON array (no markdown, no explanation):
[
  { "title": "Subtask 1 title", "description": "Short description", "acceptanceCriteria": ["Criterion 1", "Criterion 2"] },
  { "title": "Subtask 2 title", "description": "Short description", "acceptanceCriteria": ["Criterion 1"] }
]

Use 3, 4, or 5 items. Each item: title (string), description (string), acceptanceCriteria (string array).`;

export async function generateSubtasks(
  parentStory: { title: string; description: string; acceptanceCriteria: string[] }
): Promise<{ ok: true; subtasks: SubtaskItem[] } | { ok: false; error: string }> {
  const prompt = SUBTASKS_PROMPT.replace("{{title}}", parentStory.title)
    .replace("{{description}}", parentStory.description)
    .replace(
      "{{acceptanceCriteria}}",
      parentStory.acceptanceCriteria.join("; ")
    );
  try {
    const response = await llm.invoke(prompt);
    const content = response.content as string;
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return { ok: false, error: "Failed to parse LLM response as JSON array" };
    }
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      title?: string;
      description?: string;
      acceptanceCriteria?: string[] | string;
    }>;
    const subtasks: SubtaskItem[] = parsed
      .slice(0, 5)
      .map((item) => ({
        title: item.title ?? "Subtask",
        description: item.description ?? "",
        acceptanceCriteria: Array.isArray(item.acceptanceCriteria)
          ? item.acceptanceCriteria
          : [item.acceptanceCriteria ?? "Done"].filter(Boolean),
      }));
    if (subtasks.length < 3) {
      return { ok: false, error: "Expected at least 3 subtasks" };
    }
    return { ok: true, subtasks };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
