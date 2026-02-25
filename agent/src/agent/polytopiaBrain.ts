/**
 * Polytopia AI Brain
 * 
 * Agent loop that processes game state and returns optimal actions.
 * Adapted from imessage-bridge streamingAgentLoop.
 */

import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { resolveDefaultModel } from "../config/models.js";
import { POLYTOPIA_SYSTEM_PROMPT, buildGameStatePrompt } from "./prompts/polytopia.js";
import { parseAction } from "./actionParser.js";
import { getPromptOverride } from "../api/reload.js";
import { getLegalActions } from "../game/legalActions.js";
import type { GameState, Action, AgentResponse } from "../game/types.js";

export interface BrainConfig {
  model?: string;
  temperature?: number;
  maxRetries?: number;
  debug?: boolean;
}

/**
 * Process a game turn and return the best action
 */
export async function processGameTurn(
  gameState: GameState,
  playerId: number,
  config: BrainConfig = {}
): Promise<AgentResponse> {
  const {
    model = process.env.OR_MODEL,
    temperature = 0.3, // Lower temperature for more consistent play
    maxRetries = 3,
    debug = process.env.DEBUG === "true",
  } = config;

  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY!,
  });

  const selectedModel = resolveDefaultModel(model);
  
  if (debug) {
    console.log(`[PolytopiaBrain] Using model: ${selectedModel}`);
    console.log(`[PolytopiaBrain] Processing turn ${gameState.turn} for player ${playerId}`);
  }

  // Build the prompt with current game state
  const gameStatePrompt = buildGameStatePrompt(gameState, playerId);
  
  // Check for hot-reloaded prompt override
  const promptOverride = getPromptOverride();
  const systemPrompt = promptOverride || POLYTOPIA_SYSTEM_PROMPT;
  
  const fullPrompt = `${systemPrompt}

${gameStatePrompt}

Analyze the situation and decide on the best actions. Think step by step:
1. What is the current game phase (early/mid/late)?
2. What are the immediate threats or opportunities?
3. Which of my units can move? Which can attack?
4. Are there any enemy units I can attack?
5. What unexplored tiles should my units move toward?

PRIORITY ORDER:
1. ATTACK enemy units if in range
2. MOVE units to explore or advance
3. RESEARCH a tech if no units can move/attack

Respond with JSON in this exact format:
{
  "reasoning": "Your strategic reasoning here (2-3 sentences)",
  "actions": [
    { "type": "move", "unitX": 5, "unitY": 3, "toX": 6, "toY": 3 },
    { "type": "attack", "unitX": 6, "unitY": 3, "targetX": 7, "targetY": 4 },
    { "type": "research", "tech": "climbing" },
    { "type": "end_turn" }
  ],
  "confidence": 0.0-1.0
}

IMPORTANT: Use exact coordinates from the unit list. Return an "actions" array with ALL actions for this turn. Always end with {"type": "end_turn"}.`;

  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (debug) {
        console.log(`[PolytopiaBrain] Calling model: ${selectedModel}`);
      }
      
      const result = await generateText({
        model: openrouter(selectedModel),
        messages: [
          { role: "user", content: fullPrompt }
        ],
        temperature,
      });

      const responseText = result.text;
      
      if (debug) {
        console.log(`[PolytopiaBrain] Response length: ${responseText?.length || 0}`);
        console.log(`[PolytopiaBrain] Raw response:`, responseText);
      }

      // Parse the response
      const parsed = parseAgentResponse(responseText);
      let reasoning = parsed.reasoning;
      
      // Handle action sequences
      let actions: Action[] = [];

      if (parsed.actions && Array.isArray(parsed.actions)) {
        for (const rawAct of parsed.actions) {
          try {
            const validated = parseAction(rawAct, gameState, playerId);
            actions.push(validated);
          } catch (e) {
            if (debug) console.error(`[PolytopiaBrain] Invalid action skipped:`, e);
          }
        }
      } else if (parsed.action) {
        try {
          const validated = parseAction(parsed.action, gameState, playerId);
          actions.push(validated);
        } catch (e) {
          if (debug) console.error(`[PolytopiaBrain] Invalid action skipped:`, e);
        }
      }

      const hasNonEndTurnAction = actions.some((action) => action.type !== "end_turn");
      if (!hasNonEndTurnAction) {
        const fallbackAction = selectFallbackLegalAction(gameState, playerId);
        if (fallbackAction) {
          actions = [fallbackAction, { type: "end_turn" }];
          reasoning = `${reasoning} | Fallback legal action selected because model actions were invalid or empty.`;
          if (debug) {
            console.log("[PolytopiaBrain] Applied fallback legal action:", fallbackAction);
          }
        }
      }
      
      // Always end with end_turn
      if (actions.length === 0 || actions[actions.length - 1].type !== "end_turn") {
        actions.push({ type: "end_turn" });
      }
      
      if (debug) {
        console.log(`[PolytopiaBrain] Planned ${actions.length} actions`);
        console.log(`[PolytopiaBrain] Reasoning: ${reasoning}`);
      }

      return {
        reasoning,
        action: actions[0] || { type: "end_turn" }, // Backwards compat
        actions: actions, // New: full sequence
        confidence: parsed.confidence ?? 0.8,
      };
      
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorDetail = error?.response?.data || error?.cause || error?.message || error;
      console.error(`[PolytopiaBrain] Attempt ${attempt + 1} failed:`, lastError.message);
      if (debug) {
        console.error(`[PolytopiaBrain] Error details:`, JSON.stringify(errorDetail, null, 2));
      }
      
      if (attempt < maxRetries - 1) {
        await sleep(500 * (attempt + 1)); // Exponential backoff
      }
    }
  }

  // All retries failed - return safe end_turn action
  console.error(`[PolytopiaBrain] All retries failed, ending turn`);
  return {
    reasoning: `Failed to generate action after ${maxRetries} attempts: ${lastError?.message}`,
    action: { type: "end_turn" },
    confidence: 0,
  };
}

/**
 * Parse the LLM response into structured data
 */
function parseAgentResponse(responseText: string): {
  reasoning: string;
  action?: any;
  actions?: any[];
  confidence?: number;
} {
  // Try to extract JSON from the response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in response");
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    
    if (!parsed.actions && !parsed.action) {
      throw new Error("Missing 'actions' or 'action' field in response");
    }
    
    return {
      reasoning: parsed.reasoning || "No reasoning provided",
      action: parsed.action, // Backwards compat
      actions: parsed.actions, // New: sequence
      confidence: parsed.confidence,
    };
  } catch (e) {
    throw new Error(`Failed to parse JSON: ${e}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function selectFallbackLegalAction(gameState: GameState, playerId: number): Action | null {
  const legalActions = getLegalActions(gameState, playerId).filter((action) => action.type !== "end_turn");
  if (legalActions.length === 0) {
    return null;
  }

  const priority: Action["type"][] = [
    "attack",
    "capture",
    "move",
    "train",
    "research",
    "build",
    "convert",
    "disembark",
    "heal",
    "end_turn",
  ];

  for (const actionType of priority) {
    const match = legalActions.find((action) => action.type === actionType);
    if (match) {
      return match;
    }
  }

  return legalActions[0];
}
