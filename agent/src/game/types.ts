/**
 * Polytopia Game State Types
 * 
 * These types represent the game state as serialized by PolyMod.
 * Only includes visible information (respects fog of war).
 */

// Unit types in Polytopia
export type UnitType =
  | "warrior"
  | "rider"
  | "defender"
  | "swordsman"
  | "archer"
  | "catapult"
  | "knight"
  | "giant"
  | "boat"
  | "ship"
  | "battleship"
  | "mind_bender"
  | "amphibian"
  | "tridention"
  | "crab"
  | "polytaur"
  | "navalon"
  | "dragon_egg"
  | "baby_dragon"
  | "fire_dragon"
  | "mooni"
  | "ice_archer"
  | "battle_sled"
  | "ice_fortress"
  | "gaami"
  | "hexapod"
  | "kiton"
  | "phychi"
  | "raychi"
  | "shaman"
  | "exida"
  | "doomux";

// Terrain types
export type TerrainType =
  | "field"
  | "forest"
  | "mountain"
  | "water"
  | "ocean"
  | "ice"
  | "wetland";

// Resource types
export type ResourceType =
  | "fruit"
  | "game"
  | "fish"
  | "crop"
  | "ore"
  | "whale"
  | "starfish"
  | "spores"
  | "algae";

// Improvement types
export type ImprovementType =
  | "farm"
  | "mine"
  | "lumber_hut"
  | "windmill"
  | "forge"
  | "sawmill"
  | "port"
  | "customs_house"
  | "temple"
  | "forest_temple"
  | "water_temple"
  | "mountain_temple"
  | "monument"
  | "ice_temple"
  | "mycelium";

// Technology types
export type TechType =
  | "climbing"
  | "fishing"
  | "hunting"
  | "organization"
  | "riding"
  | "archery"
  | "farming"
  | "forestry"
  | "free_diving"
  | "meditation"
  | "mining"
  | "roads"
  | "shields"
  | "whaling"
  | "aquatism"
  | "chivalry"
  | "construction"
  | "mathematics"
  | "navigation"
  | "smithery"
  | "spiritualism"
  | "trade"
  | "philosophy";

// Tribe types
export type TribeType =
  | "bardur"
  | "imperius"
  | "oumaji"
  | "kickoo"
  | "hoodrick"
  | "luxidoor"
  | "vengir"
  | "zebasi"
  | "ai-mo"
  | "quetzali"
  | "yadakk"
  | "aquarion"
  | "elyrion"
  | "polaris"
  | "cymanti"
  | "custom";

/**
 * Represents a unit on the map
 */
export interface ValidMove {
  x: number;
  y: number;
  terrain: string;
}

export interface AttackTarget {
  x: number;
  y: number;
  unitType: string;
  health: number;
}

export interface Unit {
  id: number;
  type: UnitType;
  owner: number;
  health: number;
  maxHealth: number;
  attack: number;
  defense: number;
  movement: number;
  range: number;
  isVeteran: boolean;
  canMove: boolean;
  canAttack: boolean;
  kills: number;
  validMoves?: ValidMove[];
  attackTargets?: AttackTarget[];
}

/**
 * Represents a city
 */
export interface City {
  name: string;
  level: number;
  population: number;
  populationCap: number;
  isCapital: boolean;
  hasWalls: boolean;
  connectedToCapital: boolean;
}

/**
 * Represents a single tile on the map
 */
export interface Tile {
  x: number;
  y: number;
  terrain: TerrainType;
  owner: number | null;
  visible: boolean;
  explored: boolean;
  resource: ResourceType | null;
  improvement: ImprovementType | null;
  city: City | null;
  unit: Unit | null;
  hasRoad: boolean;
}

/**
 * Represents a player in the game
 */
export interface Player {
  id: number;
  tribe: TribeType;
  name: string;
  stars: number;
  starsPerTurn: number;
  techs: TechType[];
  score: number;
  cities: number;
  units: number;
  isAlive: boolean;
  isHuman: boolean;
}

/**
 * The complete game state
 */
export interface GameState {
  turn: number;
  maxTurns: number;
  currentPlayerId: number;
  gameMode: string;
  players: Player[];
  map: {
    width: number;
    height: number;
    tiles: Tile[];
  };
}

/**
 * Action types the AI can take
 */
export type Action =
  | MoveAction
  | AttackAction
  | TrainAction
  | ResearchAction
  | BuildAction
  | CaptureAction
  | HealAction
  | ConvertAction
  | DisembarkAction
  | EndTurnAction;

export interface MoveAction {
  type: "move";
  unitX: number;
  unitY: number;
  toX: number;
  toY: number;
}

export interface AttackAction {
  type: "attack";
  unitX: number;
  unitY: number;
  targetX: number;
  targetY: number;
}

export interface TrainAction {
  type: "train";
  cityX: number;
  cityY: number;
  unitType: UnitType;
}

export interface ResearchAction {
  type: "research";
  tech: TechType;
}

export interface BuildAction {
  type: "build";
  tileX: number;
  tileY: number;
  improvement: ImprovementType;
}

export interface CaptureAction {
  type: "capture";
  unitX: number;
  unitY: number;
}

export interface HealAction {
  type: "heal";
  unitX: number;
  unitY: number;
}

export interface ConvertAction {
  type: "convert";
  unitX: number;
  unitY: number;
  targetX: number;
  targetY: number;
}

export interface DisembarkAction {
  type: "disembark";
  unitX: number;
  unitY: number;
  toX: number;
  toY: number;
}

export interface EndTurnAction {
  type: "end_turn";
}

/**
 * Response from the AI agent
 */
export interface AgentResponse {
  reasoning: string;
  action: Action;
  actions?: Action[];
  confidence: number;
}

/**
 * Request to the /api/turn endpoint
 */
export interface TurnRequest {
  gameState: GameState;
  playerId: number;
}

/**
 * Response from /api/turn endpoint
 */
export interface TurnResponse {
  success: boolean;
  action?: Action;
  actions?: Action[];
  reasoning?: string;
  error?: string;
}

