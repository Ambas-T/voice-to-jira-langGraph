import { Router } from "express";
import type { Request, Response } from "express";
import { generateStory, createJiraStory, createSubtasksFromStory } from "../../langgraph/index.js";

const router = Router();

interface GenerateStoryBody {
  topic?: string;
}

interface CreateJiraBody {
  title?: string;
  description?: string;
  acceptanceCriteria?: string[];
  optionalFields?: {
    parentKey?: string;
    dueDate?: string;
    startDate?: string;
    labels?: string[];
    teamId?: string;
  };
}

interface CreateSubtasksBody {
  title?: string;
  description?: string;
  acceptanceCriteria?: string[];
  /** Parent issue key - subtasks will be linked to this parent */
  parentKey?: string;
}

router.post("/generate-story", async (req: Request, res: Response) => {
  try {
    const { topic } = req.body as GenerateStoryBody;
    if (!topic || typeof topic !== "string") {
      res.status(400).json({ error: "Missing or invalid topic" });
      return;
    }
    const result = await generateStory(topic.trim());
    if (result.ok) {
      res.json({ story: result.story });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

router.post("/create-jira", async (req: Request, res: Response) => {
  try {
    const { title, description, acceptanceCriteria, optionalFields } =
      req.body as CreateJiraBody;
    if (!title || !description || !Array.isArray(acceptanceCriteria)) {
      res.status(400).json({
        error: "Missing title, description, or acceptanceCriteria",
      });
      return;
    }
    const result = await createJiraStory({
      title,
      description,
      acceptanceCriteria,
      optionalFields,
    });
    if (result.ok) {
      res.json(result.result);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

router.post("/create-subtasks", async (req: Request, res: Response) => {
  try {
    const { title, description, acceptanceCriteria, parentKey } = req.body as CreateSubtasksBody;
    if (!title || !description || !Array.isArray(acceptanceCriteria)) {
      res.status(400).json({
        error: "Missing title, description, or acceptanceCriteria",
      });
      return;
    }
    if (!parentKey) {
      res.status(400).json({
        error: "Missing parentKey - subtasks must be linked to a parent story",
      });
      return;
    }
    const result = await createSubtasksFromStory({
      title,
      description,
      acceptanceCriteria,
      parentKey,
    });
    if (result.ok) {
      res.json({ createdSubtaskIssues: result.createdSubtaskIssues });
    } else {
      console.error("[create-subtasks] graph/API error:", result.error);
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    console.error("[create-subtasks] unexpected error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

export default router;
