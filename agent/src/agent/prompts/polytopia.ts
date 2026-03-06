/**
 * Polytopia AI System Prompt
 * 
 * Teaches the LLM how to play Polytopia optimally.
 */

import type { GameState } from "../../game/types.js";

export const POLYTOPIA_SYSTEM_PROMPT = `You are an expert Polytopia player. You analyze game states and decide optimal moves to win.

## GAME OVERVIEW
Polytopia is a turn-based 4X strategy game. Goal: Highest score by turn 30, or eliminate all opponents.

## RESOURCES
- Stars: Currency for all actions. Earned from cities each turn.
- Population: Grows cities. Each level increases star income.

## KEY MECHANICS
- Units can move OR attack each turn (not both, unless they have "dash" or "persist")
- Cities produce 1 star per population level
- Capturing villages gives you new cities
- Technologies unlock units, improvements, and abilities

## UNIT PRIORITIES (by strength)
1. Giants (35 HP, 5 ATK) - Extremely powerful
2. Knights (15 HP, 3.5 ATK, dash) - Can attack then move
3. Swordsmen (15 HP, 3 ATK) - Solid offensive
4. Defenders (15 HP, 1 ATK, 3 DEF) - Hold positions
5. Catapults (10 HP, 4 ATK, 3 range) - Siege units
6. Archers (10 HP, 2 ATK, 2 range) - Ranged support
7. Riders (10 HP, 2 ATK, dash) - Fast harassment
8. Warriors (10 HP, 2 ATK) - Basic unit

## TECH PRIORITIES
Early game: Organization (farms) > Climbing (mountains) > Hunting or Fishing (resources)
Mid game: Shields (defenders) > Smithery (swordsmen) > Mathematics (catapults)
Late game: Philosophy (mind benders) > Chivalry (knights) > Construction (monuments)

## IMPROVEMENT VALUES
- Farms (2 pop) - Best for growth
- Mines (2 pop) - Mountains
- Lumber Huts (1 pop) - Forests, but destroys them
- Ports (2 pop) - Coastal cities
- Temples (1 pop/turn) - Long-term income
- Monuments (400 points) - Late game score

## STRATEGIC PRINCIPLES
1. EARLY GAME (turns 1-10): 
   - **IF YOU HAVE 0 UNITS: Train warriors immediately** - you cannot explore or attack without units
   - Expand aggressively. Capture villages. Train units every turn if you have stars
   - Research economy techs ONLY if you already have units exploring
   - Move units to explore new tiles and find villages
2. MID GAME (turns 11-20): Build army. Defend borders. Attack weak neighbors.
3. LATE GAME (turns 21-30): Maximize score. Build monuments/temples. Eliminate threats.

## CRITICAL RULES (READ CAREFULLY)
- **If you have units: MOVE them to explore! ATTACK enemies!**
- **If you see enemy units: ATTACK them with your units**
- **If no units available: Research a tech and end turn**
- **Use unitX/unitY coordinates from the unit list to specify which unit**

## TACTICAL RULES
- Attack weak units first (kill > damage)
- Defend cities with defenders on chokepoints
- Use terrain: forests give defense, mountains block movement
- Catapults behind front line, never exposed
- Knights can attack and retreat (dash)
- Stack damage: multiple units attacking same target

## ACTION FORMAT
Respond with JSON containing a sequence of actions. Plan your ENTIRE turn:

{
  "reasoning": "Your strategic plan for this turn (2-3 sentences)",
  "actions": [
    { "type": "move", "unitX": 5, "unitY": 3, "toX": 6, "toY": 3 },
    { "type": "attack", "unitX": 6, "unitY": 3, "targetX": 7, "targetY": 4 },
    { "type": "research", "tech": "climbing" },
    { "type": "end_turn" }
  ],
  "confidence": 0.8
}

Available action types:
- move: { "type": "move", "unitX": 5, "unitY": 3, "toX": 6, "toY": 3 } - Move unit from (unitX, unitY) to (toX, toY)
- attack: { "type": "attack", "unitX": 5, "unitY": 3, "targetX": 6, "targetY": 4 } - Attack enemy at (targetX, targetY) with unit at (unitX, unitY)
- research: { "type": "research", "tech": "climbing" } - Research tech (climbing, fishing, hunting, organization, riding, etc.)
- end_turn: { "type": "end_turn" } - End your turn (ALWAYS include at end)

CRITICAL RULES:
- Use the EXACT coordinates from the unit list for unitX/unitY
- Each unit in the game state has a "validMoves" array listing EXACTLY which tiles it can legally move to. YOU MUST ONLY move to tiles listed in validMoves. If validMoves is empty, the unit cannot move.
- Each unit also has an "attackTargets" array listing enemies it can legally attack. Only attack targets listed there.
- Never guess coordinates — only use moves and attacks from validMoves/attackTargets
- Never research a tech you already have

IMPORTANT: Return ALL actions you want to take this turn in the "actions" array. Always end with "end_turn".`;

/**
 * Build a detailed prompt describing the current game state
 * Handles both full game state (from PolyMod) and simple state (from Frida)
 */
export function buildGameStatePrompt(gameState: GameState, playerId: number): string {
  // Handle simplified Frida game state
  const players = gameState.players || [];
  const gs = gameState as any;
  const tiles = gameState.map?.tiles || gs.tiles || [];

  // Extract units from tiles if not provided as separate array (PolyMod embeds units in tiles)
  const units = gs.units || tiles
    .filter((t: any) => t.unit && t.visible)
    .map((t: any) => ({
      ...t.unit,
      x: t.x,
      y: t.y,
      id: `${t.unit.type}_${t.x}_${t.y}`
    }));

  const myPlayer = players.find((p: any) => p.id === playerId);
  const enemies = players.filter((p: any) => p.id !== playerId && p.id !== 255);
  const legalActions = Array.isArray((gameState as any).legalActions) ? (gameState as any).legalActions : [];
  const legalResearch = legalActions.filter((action: any) => action.type === "research");
  const legalTrains = legalActions.filter((action: any) => action.type === "train");
  const legalBuilds = legalActions.filter((action: any) => action.type === "build");

  // Get my tiles and units from the available data
  const myTiles = tiles.filter((t: any) => t.owner === playerId);
  const myUnits = units.filter((u: any) => u.owner === playerId);
  const enemyUnits = units.filter((u: any) => u.owner !== playerId && u.owner !== 255);
  
  // Build simplified state description that works with limited data
  let prompt = `## CURRENT GAME STATE

### General Info
- Turn: ${gameState.turn || 0}
- Map Size: ${gameState.map?.width || "?"}x${gameState.map?.height || "?"}

### My Status (Player ${playerId})
- Stars: ${(myPlayer as any)?.currency || myPlayer?.stars || "?"}
- Stars per turn: ${myPlayer?.starsPerTurn ?? "?"}
- Score: ${myPlayer?.score || "?"}
- Cities: ${myPlayer?.cities || "?"}
- Known techs: ${myPlayer?.techs?.join(", ") || "none"}
- Unlockable techs: ${(myPlayer as any)?.unlockableTechs?.join(", ") || (legalResearch.map((action: any) => action.tech).join(", ") || "none")}
- Unlockable units: ${(myPlayer as any)?.unlockedUnits?.join(", ") || "unknown"}
- Unlockable improvements: ${(myPlayer as any)?.unlockableImprovements?.join(", ") || (legalBuilds.map((action: any) => action.improvement).join(", ") || "none")}

### Enemies`;

  if (enemies.length > 0) {
    prompt += "\n" + enemies.map((e: any) => 
      `- Player ${e.id}: ${e.currency || e.stars || "?"} stars, ${e.cities || "?"} cities, score ${e.score || "?"}`
    ).join("\n");
  } else {
    prompt += "\n- None detected yet";
  }

  prompt += `

### MY UNITS (${myUnits.length} total) - USE THESE COORDINATES FOR MOVE/ATTACK`;

  if (myUnits.length > 0) {
    prompt += "\n" + myUnits.slice(0, 15).map((u: any) => {
      let line = `- ${u.type.toUpperCase()} at (${u.x}, ${u.y}) | HP: ${u.health}/${u.maxHealth}`;
      const moves: any[] = u.validMoves ?? [];
      const targets: any[] = u.attackTargets ?? [];
      if (moves.length > 0) {
        line += `\n    VALID MOVES: ${moves.map((m: any) => `(${m.x},${m.y})`).join(", ")}`;
      } else {
        line += `\n    VALID MOVES: none`;
      }
      if (targets.length > 0) {
        line += `\n    ATTACK TARGETS: ${targets.map((t: any) => `${t.unitType} at (${t.x},${t.y}) HP:${t.health}`).join(", ")}`;
      }
      return line;
    }).join("\n");
  } else {
    prompt += "\n- No units available";
  }

  prompt += `

### ENEMY UNITS (${enemyUnits.length} total) - ATTACK TARGETS`;
  if (enemyUnits.length > 0) {
    prompt += "\n" + enemyUnits.slice(0, 10).map((u: any) =>
      `- ${u.type.toUpperCase()} at (${u.x}, ${u.y}) | owner: ${u.owner} | HP: ${u.health}`
    ).join("\n");
  } else {
    prompt += "\n- No enemy units visible";
  }

  // Find cities for context
  const myCities = tiles.filter((t: any) => t.city && t.owner === playerId);

  prompt += `

### Territory
- Tiles I own: ${myTiles.length}
- My cities: ${myCities.length}
${myCities.length > 0 ? `- City locations: ${myCities.slice(0, 5).map((t: any) => `${t.city.name} at (${t.x}, ${t.y})`).join(", ")}` : ""}

### RUNTIME LEGAL ACTIONS
- Total legal actions provided by runtime: ${legalActions.length || 0}
${legalResearch.length > 0 ? `- RESEARCH OPTIONS: ${legalResearch.map((action: any) => action.tech).join(", ")}` : "- RESEARCH OPTIONS: none provided"}
${legalTrains.length > 0 ? `- TRAIN OPTIONS: ${legalTrains.slice(0, 8).map((action: any) => `${action.unitType} at (${action.cityX}, ${action.cityY})`).join(", ")}` : "- TRAIN OPTIONS: none provided"}
${legalBuilds.length > 0 ? `- BUILD OPTIONS: ${legalBuilds.slice(0, 8).map((action: any) => `${action.improvement} at (${action.tileX}, ${action.tileY})`).join(", ")}` : "- BUILD OPTIONS: none provided"}

### WHAT YOU CAN DO THIS TURN
${myUnits.length > 0 ? `✅ You have ${myUnits.length} unit(s) - MOVE and ATTACK with them using their coordinates!` : ""}
${myUnits.filter((u: any) => u.canMove).length > 0 ? `  → Units that can MOVE: ${myUnits.filter((u: any) => u.canMove).map((u: any) => `${u.type} at (${u.x}, ${u.y})`).join(", ")}` : ""}
${myUnits.filter((u: any) => u.canAttack).length > 0 && enemyUnits.length > 0 ? `  → Units that can ATTACK: ${myUnits.filter((u: any) => u.canAttack).map((u: any) => `${u.type} at (${u.x}, ${u.y})`).join(", ")}` : ""}
${enemyUnits.length > 0 ? `⚔️ ENEMY UNITS to attack: ${enemyUnits.slice(0, 5).map((u: any) => `${u.type} at (${u.x}, ${u.y})`).join(", ")}` : ""}
${myUnits.length === 0 ? `⚠️ You have no units. Research a tech and end turn.` : ""}

### ACTION FORMAT REMINDER
- MOVE: { "type": "move", "unitX": 5, "unitY": 3, "toX": 6, "toY": 3 }
- ATTACK: { "type": "attack", "unitX": 5, "unitY": 3, "targetX": 6, "targetY": 4 }
- RESEARCH: { "type": "research", "tech": "climbing" }
- END TURN: { "type": "end_turn" }

Use the EXACT coordinates from the unit list above. Always end with end_turn.`;

  return prompt;
}
