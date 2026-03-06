/**
 * Mock Game State for Testing
 * 
 * Run with: npx tsx src/test/mockGame.ts
 */

import type { GameState } from "../game/types.js";

// Sample game state for testing
export const mockGameState: GameState = {
  turn: 5,
  maxTurns: 30,
  currentPlayerId: 0,
  gameMode: "perfection",
  players: [
    {
      id: 0,
      tribe: "imperius",
      name: "AI Player",
      stars: 12,
      starsPerTurn: 4,
      techs: ["organization", "climbing"],
      score: 450,
      cities: 2,
      units: 3,
      isAlive: true,
      isHuman: false,
    },
    {
      id: 1,
      tribe: "bardur",
      name: "Enemy",
      stars: 8,
      starsPerTurn: 3,
      techs: ["hunting"],
      score: 380,
      cities: 1,
      units: 2,
      isAlive: true,
      isHuman: false,
    },
  ],
  map: {
    width: 11,
    height: 11,
    tiles: [
      // Row 0
      { x: 0, y: 0, terrain: "field", owner: 0, visible: true, explored: true, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      { x: 1, y: 0, terrain: "forest", owner: 0, visible: true, explored: true, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      { x: 2, y: 0, terrain: "field", owner: 0, visible: true, explored: true, resource: "fruit", improvement: null, city: null, unit: null, hasRoad: false },
      { x: 3, y: 0, terrain: "mountain", owner: null, visible: true, explored: true, resource: "ore", improvement: null, city: null, unit: null, hasRoad: false },
      { x: 4, y: 0, terrain: "field", owner: null, visible: true, explored: true, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      
      // Row 1 - AI capital
      { x: 0, y: 1, terrain: "field", owner: 0, visible: true, explored: true, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      { 
        x: 1, y: 1, terrain: "field", owner: 0, visible: true, explored: true, resource: null, improvement: null, 
        city: { name: "Imperius", level: 2, population: 2, populationCap: 3, isCapital: true, hasWalls: false, connectedToCapital: true },
        unit: null, hasRoad: true 
      },
      { x: 2, y: 1, terrain: "field", owner: 0, visible: true, explored: true, resource: null, improvement: "farm", city: null, unit: null, hasRoad: false },
      { x: 3, y: 1, terrain: "field", owner: null, visible: true, explored: true, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      { x: 4, y: 1, terrain: "water", owner: null, visible: true, explored: true, resource: "fish", improvement: null, city: null, unit: null, hasRoad: false },
      
      // Row 2 - AI warrior
      { x: 0, y: 2, terrain: "field", owner: 0, visible: true, explored: true, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      { x: 1, y: 2, terrain: "field", owner: 0, visible: true, explored: true, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      { 
        x: 2, y: 2, terrain: "field", owner: 0, visible: true, explored: true, resource: null, improvement: null, city: null, 
        unit: { id: 1, type: "warrior", owner: 0, health: 10, maxHealth: 10, attack: 2, defense: 2, movement: 1, range: 1, isVeteran: false, canMove: true, canAttack: true, kills: 0 },
        hasRoad: false 
      },
      { x: 3, y: 2, terrain: "field", owner: null, visible: true, explored: true, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      { x: 4, y: 2, terrain: "water", owner: null, visible: true, explored: true, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      
      // Row 3 - Neutral village
      { x: 0, y: 3, terrain: "field", owner: null, visible: true, explored: true, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      { x: 1, y: 3, terrain: "field", owner: null, visible: true, explored: true, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      { x: 2, y: 3, terrain: "field", owner: null, visible: true, explored: true, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      { 
        x: 3, y: 3, terrain: "field", owner: null, visible: true, explored: true, resource: null, improvement: null, 
        city: { name: "Village", level: 1, population: 0, populationCap: 2, isCapital: false, hasWalls: false, connectedToCapital: false },
        unit: null, hasRoad: false 
      },
      { x: 4, y: 3, terrain: "ocean", owner: null, visible: true, explored: true, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      
      // Row 4 - AI second warrior
      { x: 0, y: 4, terrain: "forest", owner: null, visible: true, explored: true, resource: "game", improvement: null, city: null, unit: null, hasRoad: false },
      { 
        x: 1, y: 4, terrain: "field", owner: null, visible: true, explored: true, resource: null, improvement: null, city: null, 
        unit: { id: 2, type: "warrior", owner: 0, health: 10, maxHealth: 10, attack: 2, defense: 2, movement: 1, range: 1, isVeteran: false, canMove: true, canAttack: true, kills: 0 },
        hasRoad: false 
      },
      { x: 2, y: 4, terrain: "field", owner: null, visible: true, explored: true, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      { x: 3, y: 4, terrain: "field", owner: null, visible: true, explored: true, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      { x: 4, y: 4, terrain: "ocean", owner: null, visible: true, explored: true, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      
      // Row 5 - Enemy territory starts
      { x: 0, y: 5, terrain: "field", owner: null, visible: true, explored: true, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      { x: 1, y: 5, terrain: "field", owner: null, visible: true, explored: true, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      { x: 2, y: 5, terrain: "forest", owner: 1, visible: true, explored: true, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      { 
        x: 3, y: 5, terrain: "field", owner: 1, visible: true, explored: true, resource: null, improvement: null, city: null, 
        unit: { id: 3, type: "warrior", owner: 1, health: 8, maxHealth: 10, attack: 2, defense: 2, movement: 1, range: 1, isVeteran: false, canMove: true, canAttack: true, kills: 0 },
        hasRoad: false 
      },
      { x: 4, y: 5, terrain: "field", owner: 1, visible: true, explored: true, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      
      // Row 6 - Enemy capital
      { x: 0, y: 6, terrain: "mountain", owner: null, visible: false, explored: false, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      { x: 1, y: 6, terrain: "field", owner: 1, visible: true, explored: true, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      { 
        x: 2, y: 6, terrain: "field", owner: 1, visible: true, explored: true, resource: null, improvement: null, 
        city: { name: "Barduria", level: 2, population: 1, populationCap: 3, isCapital: true, hasWalls: false, connectedToCapital: true },
        unit: null, hasRoad: false 
      },
      { x: 3, y: 6, terrain: "field", owner: 1, visible: true, explored: true, resource: "game", improvement: null, city: null, unit: null, hasRoad: false },
      { x: 4, y: 6, terrain: "forest", owner: 1, visible: true, explored: true, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      
      // Fog of war - unexplored tiles
      { x: 0, y: 7, terrain: "field", owner: null, visible: false, explored: false, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      { x: 1, y: 7, terrain: "field", owner: null, visible: false, explored: false, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      { x: 2, y: 7, terrain: "field", owner: null, visible: false, explored: false, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      { x: 3, y: 7, terrain: "field", owner: null, visible: false, explored: false, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
      { x: 4, y: 7, terrain: "field", owner: null, visible: false, explored: false, resource: null, improvement: null, city: null, unit: null, hasRoad: false },
    ],
  },
  legalActions: [
    { type: "move", unitX: 2, unitY: 2, toX: 3, toY: 2 },
    { type: "move", unitX: 2, unitY: 2, toX: 2, toY: 3 },
    { type: "move", unitX: 1, unitY: 4, toX: 2, toY: 4 },
    { type: "move", unitX: 1, unitY: 4, toX: 1, toY: 5 },
    { type: "train", cityX: 1, cityY: 1, unitType: "warrior" },
    { type: "train", cityX: 1, cityY: 1, unitType: "rider" },
    { type: "research", tech: "riding" },
    { type: "research", tech: "hunting" },
    { type: "end_turn" },
  ],
};

// Run test if executed directly
async function runTest() {
  console.log("Testing Polytopia Agent with mock game state...\n");
  
  // Dynamic import to avoid issues
  const { processGameTurn } = await import("../agent/polytopiaBrain.js");
  
  console.log("Game State Summary:");
  console.log(`- Turn: ${mockGameState.turn}/${mockGameState.maxTurns}`);
  console.log(`- Players: ${mockGameState.players.map(p => p.tribe).join(" vs ")}`);
  console.log(`- My stars: ${mockGameState.players[0].stars}`);
  console.log(`- My techs: ${mockGameState.players[0].techs.join(", ")}`);
  console.log("");
  
  try {
    const result = await processGameTurn(mockGameState, 0, { debug: true });
    
    console.log("\n=== RESULT ===");
    console.log("Action:", JSON.stringify(result.action, null, 2));
    console.log("Reasoning:", result.reasoning);
    console.log("Confidence:", result.confidence);
  } catch (error) {
    console.error("Test failed:", error);
  }
}

// Check if running directly
const isMain = process.argv[1]?.includes("mockGame");
if (isMain) {
  runTest();
}


