import fs from 'node:fs';
import path from 'node:path';
import type { GameLogEntry } from '@insider-trading/shared';

let currentFile: string | null = null;

export function logFilePath(gameLogsDir: string, gameId: string, startedAt: string): string {
  const stamp = startedAt.replace(/[:.]/g, '-');
  return path.join(gameLogsDir, `${stamp}-${gameId}.jsonl`);
}

export function openLog(gameLogsDir: string, gameId: string, startedAt: string): string {
  if (!fs.existsSync(gameLogsDir)) fs.mkdirSync(gameLogsDir, { recursive: true });
  currentFile = logFilePath(gameLogsDir, gameId, startedAt);
  // Truncate if it somehow exists (shouldn't — gameId is fresh).
  fs.writeFileSync(currentFile, '');
  return currentFile;
}

export function appendLog(entry: GameLogEntry): void {
  if (!currentFile) return; // No active game: silently skip (e.g. lobby state ops).
  fs.appendFileSync(currentFile, JSON.stringify(entry) + '\n');
}

export function closeLog(): void {
  currentFile = null;
}

export function activeLogFile(): string | null {
  return currentFile;
}

/** Read & parse a per-game log file back into entries. Used for replay assertions. */
export function readLogFile(filePath: string): GameLogEntry[] {
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];
  return raw.split('\n').map(line => JSON.parse(line) as GameLogEntry);
}
