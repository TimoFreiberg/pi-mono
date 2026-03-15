/**
 * Persistent prompt history across sessions.
 *
 * Stores prompts in a JSONL file (~/.pi/agent/prompt-history.jsonl).
 * Each line is a JSON object: { "t": <unix_ms>, "p": "<prompt>" }
 *
 * History is loaded on startup and merged with in-session history,
 * so pressing up-arrow shows prompts from previous sessions too.
 */

import * as fs from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "../config.js";

const MAX_HISTORY_ENTRIES = 500;
const HISTORY_FILENAME = "prompt-history.jsonl";
/** Skip reading files larger than 2MB to guard against corruption/external writes */
const MAX_FILE_SIZE = 2 * 1024 * 1024;

interface HistoryEntry {
	/** Unix timestamp in ms */
	t: number;
	/** Prompt text */
	p: string;
}

interface LoadResult {
	entries: HistoryEntry[];
	/** Number of raw (pre-dedup) lines parsed from the file */
	rawLines: number;
}

function getHistoryPath(): string {
	return join(getAgentDir(), HISTORY_FILENAME);
}

/**
 * Load prompt history entries from disk, most recent first.
 * Returns deduplicated entries with timestamps preserved, capped at MAX_HISTORY_ENTRIES,
 * along with the raw line count for compaction decisions.
 */
function loadEntries(): LoadResult {
	const historyPath = getHistoryPath();
	try {
		// Guard against unbounded file reads
		const stat = fs.statSync(historyPath);
		if (stat.size > MAX_FILE_SIZE) {
			console.debug(`[prompt-history] File exceeds ${MAX_FILE_SIZE} bytes (${stat.size}), skipping load`);
			return { entries: [], rawLines: 0 };
		}

		const content = fs.readFileSync(historyPath, "utf-8");
		const lines = content.trim().split("\n").filter(Boolean);
		const rawLines = lines.length;
		const entries: HistoryEntry[] = [];
		for (const line of lines) {
			try {
				const entry = JSON.parse(line) as HistoryEntry;
				if (entry.p && typeof entry.p === "string") {
					entries.push(entry);
				}
			} catch {
				// Skip malformed lines
			}
		}
		// Sort by timestamp descending (most recent first)
		entries.sort((a, b) => b.t - a.t);

		// Deduplicate, keeping the most recent occurrence of each prompt
		const seen = new Set<string>();
		const result: HistoryEntry[] = [];
		for (const entry of entries) {
			const trimmed = entry.p.trim();
			if (!trimmed || seen.has(trimmed)) continue;
			seen.add(trimmed);
			result.push({ t: entry.t, p: trimmed });
			if (result.length >= MAX_HISTORY_ENTRIES) break;
		}
		return { entries: result, rawLines };
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
			console.debug("[prompt-history] Failed to load history:", err);
		}
		return { entries: [], rawLines: 0 };
	}
}

/**
 * Load prompt history from disk and optionally compact the file if bloated.
 * Returns deduplicated prompt strings (most recent first), capped at MAX_HISTORY_ENTRIES.
 */
export function loadPromptHistory(): string[] {
	const { entries, rawLines } = loadEntries();
	// Compact when raw lines are at least 50% more than deduped, with a minimum amount of bloat
	if (rawLines > entries.length * 1.5 && rawLines - entries.length > 50) {
		writeCompacted(entries);
	}
	return entries.map((e) => e.p);
}

/**
 * Append a prompt to the persistent history file.
 */
export function appendPromptHistory(prompt: string): void {
	const trimmed = prompt.trim();
	if (!trimmed) return;

	const historyPath = getHistoryPath();
	const entry: HistoryEntry = { t: Date.now(), p: trimmed };

	try {
		const dir = getAgentDir();
		fs.mkdirSync(dir, { recursive: true });
		fs.appendFileSync(historyPath, `${JSON.stringify(entry)}\n`);
	} catch (err) {
		console.debug("[prompt-history] Failed to append:", err);
	}
}

/**
 * Write compacted entries to the history file using atomic rename.
 */
function writeCompacted(entries: HistoryEntry[]): void {
	if (entries.length === 0) return;
	const historyPath = getHistoryPath();
	try {
		const content = `${entries.map((e) => JSON.stringify(e)).join("\n")}\n`;
		const dir = getAgentDir();
		const tmpPath = join(dir, `.prompt-history-${process.pid}.tmp`);
		fs.writeFileSync(tmpPath, content);
		fs.renameSync(tmpPath, historyPath);
	} catch (err) {
		console.debug("[prompt-history] Failed to compact:", err);
	}
}
