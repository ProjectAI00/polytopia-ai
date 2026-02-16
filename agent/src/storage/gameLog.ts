import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const LOGS_DIR = path.resolve(process.cwd(), "logs");

interface TurnLogEntry {
  turn: number;
  timestamp: string;
  state: unknown;
  actions: unknown;
  reasoning: string;
}

interface GameLogFile {
  gameId: string;
  startedAt: string;
  endedAt?: string;
  turns: TurnLogEntry[];
  outcome?: unknown;
}

function getLogPath(gameId: string): string {
  return path.join(LOGS_DIR, `${gameId}.json`);
}

async function ensureLogsDir(): Promise<void> {
  await mkdir(LOGS_DIR, { recursive: true });
}

async function readGameLog(gameId: string): Promise<GameLogFile> {
  const raw = await readFile(getLogPath(gameId), "utf-8");
  return JSON.parse(raw) as GameLogFile;
}

async function writeGameLog(gameId: string, data: GameLogFile): Promise<void> {
  await writeFile(getLogPath(gameId), JSON.stringify(data, null, 2), "utf-8");
}

export async function startGameLog(gameId: string): Promise<string> {
  await ensureLogsDir();
  const uniqueGameId = `${gameId}-${Date.now()}`;
  const log: GameLogFile = {
    gameId: uniqueGameId,
    startedAt: new Date().toISOString(),
    turns: [],
  };
  await writeGameLog(uniqueGameId, log);
  return uniqueGameId;
}

export async function logTurn(
  gameId: string,
  turn: number,
  state: unknown,
  actions: unknown,
  reasoning: string
): Promise<void> {
  await ensureLogsDir();
  let log: GameLogFile;

  try {
    log = await readGameLog(gameId);
  } catch {
    log = {
      gameId,
      startedAt: new Date().toISOString(),
      turns: [],
    };
  }

  log.turns.push({
    turn,
    timestamp: new Date().toISOString(),
    state,
    actions,
    reasoning,
  });

  await writeGameLog(gameId, log);
}

export async function endGameLog(gameId: string, outcome: unknown): Promise<void> {
  await ensureLogsDir();
  let log: GameLogFile;

  try {
    log = await readGameLog(gameId);
  } catch {
    log = {
      gameId,
      startedAt: new Date().toISOString(),
      turns: [],
    };
  }

  log.outcome = outcome;
  log.endedAt = new Date().toISOString();
  await writeGameLog(gameId, log);
}
