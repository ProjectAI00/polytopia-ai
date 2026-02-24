/**
 * Turn API Endpoint
 * 
 * POST /api/turn - Process a game turn and return the next action
 */

import type { Request, Response } from "express";
import { processGameTurn } from "../agent/polytopiaBrain.js";
import { logTurn } from "../storage/gameLog.js";
import type { TurnRequest, TurnResponse, GameState } from "../game/types.js";

/**
 * Handle turn request from PolyMod
 */
export async function handleTurnRequest(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  
  try {
    const body = req.body as TurnRequest;
    
    // Validate request
    if (!body.gameState) {
      res.status(400).json({
        success: false,
        error: "Missing gameState in request body",
      } as TurnResponse);
      return;
    }
    
    if (typeof body.playerId !== "number") {
      res.status(400).json({
        success: false,
        error: "Missing or invalid playerId in request body",
      } as TurnResponse);
      return;
    }

    const { gameState, playerId } = body;

    if (!validateGameState(gameState)) {
      res.status(400).json({
        success: false,
        error: "Invalid gameState structure",
      } as TurnResponse);
      return;
    }
    
    console.log(`[API] Processing turn ${gameState.turn} for player ${playerId}`);

    // Process the turn
    const result = await processGameTurn(gameState, playerId, {
      debug: process.env.DEBUG === "true",
    });

    const duration = Date.now() - startTime;
    
    // Use actions array if available, otherwise create from single action
    const actions = result.actions || [];
    if (actions.length === 0) {
      if (result.action && result.action.type !== "end_turn") {
        actions.push(result.action);
      }
      actions.push({ type: "end_turn" });
    }
    
    console.log(`[API] ${actions.length} actions planned (${duration}ms, confidence: ${result.confidence})`);

    // Phase 2: Log every turn asynchronously (non-blocking)
    const gameId = `game-${gameState.turn}-p${playerId}`;
    logTurn(gameId, gameState.turn, gameState, actions, result.reasoning).catch(() => {/* ignore log errors */});

    res.json({
      success: true,
      action: actions[0] || { type: "end_turn" },  // Backwards compat
      actions: actions,                              // New: full sequence
      reasoning: result.reasoning,
    } as TurnResponse);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[API] Error processing turn:`, errorMessage);
    
    res.status(500).json({
      success: false,
      error: errorMessage,
    } as TurnResponse);
  }
}

/**
 * Validate game state structure
 */
function validateGameState(gameState: any): gameState is GameState {
  if (!gameState || typeof gameState !== "object") return false;
  if (typeof gameState.turn !== "number") return false;
  if (!Array.isArray(gameState.players)) return false;
  if (!gameState.map || !Array.isArray(gameState.map.tiles)) return false;
  return true;
}

