/**
 * Hot-reload endpoint for updating AI behavior mid-game
 * POST /api/reload-prompt - Update the prompt override
 * GET /api/reload-prompt - Get current prompt override
 */

import type { Request, Response } from "express";

// In-memory prompt override (persists across requests)
let promptOverride: string | null = null;
let lastUpdated: Date | null = null;

/**
 * Update the prompt override
 */
export async function handleReloadPrompt(req: Request, res: Response): Promise<void> {
  if (req.method === "GET") {
    res.json({
      success: true,
      hasOverride: promptOverride !== null,
      lastUpdated: lastUpdated?.toISOString() || null,
      preview: promptOverride ? promptOverride.substring(0, 200) + "..." : null,
    });
    return;
  }

  if (req.method === "POST") {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({
        success: false,
        error: "Missing or invalid 'prompt' field in request body",
      });
      return;
    }

    promptOverride = prompt;
    lastUpdated = new Date();

    console.log(`[Reload] Prompt override updated at ${lastUpdated.toISOString()}`);
    console.log(`[Reload] Preview: ${prompt.substring(0, 100)}...`);

    res.json({
      success: true,
      message: "Prompt override updated",
      lastUpdated: lastUpdated.toISOString(),
    });
    return;
  }

  res.status(405).json({
    success: false,
    error: "Method not allowed",
  });
}

/**
 * Get the current prompt override (if any)
 */
export function getPromptOverride(): string | null {
  return promptOverride;
}

/**
 * Clear the prompt override
 */
export function clearPromptOverride(): void {
  promptOverride = null;
  lastUpdated = null;
}



