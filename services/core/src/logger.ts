/**
 * Chalo-X Centralized Logger
 * Writes formatted, timestamped logs to console AND append-only file `services/core/logs/chalo.log`.
 * Inspect via `read` or shell anytime to debug without pasting terminal logs.
 */
import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const LOG_DIR = join(__dirname, "../logs");
const LOG_FILE = join(LOG_DIR, "chalo.log");

try {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
} catch {}

function formatTime(): string {
  return new Date().toISOString();
}

function writeLine(level: string, tag: string, message: string, data?: unknown): void {
  const meta = data !== undefined ? (typeof data === "string" ? ` | ${data}` : ` | ${JSON.stringify(data)}`) : "";
  const line = `[${formatTime()}] [${level.toUpperCase()}] [${tag}] ${message}${meta}\n`;

  // Write to console
  if (level === "error") {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }

  // Append to log file
  try {
    appendFileSync(LOG_FILE, line, { encoding: "utf-8" });
  } catch {}
}

export const logger = {
  info(tag: string, msg: string, data?: unknown): void {
    writeLine("info", tag, msg, data);
  },
  warn(tag: string, msg: string, data?: unknown): void {
    writeLine("warn", tag, msg, data);
  },
  error(tag: string, msg: string, err?: unknown): void {
    const errData = err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err;
    writeLine("error", tag, msg, errData);
  },
  http(method: string, url: string, status: number, durationMs: number, extra?: unknown): void {
    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    writeLine(level, "HTTP", `${method} ${url} -> ${status} (${durationMs.toFixed(1)}ms)`, extra);
  },
  ws(channel: "rider" | "driver", event: string, userId: string, payload?: unknown): void {
    writeLine("info", `WS:${channel.toUpperCase()}`, `${event} user=${userId.slice(0, 8)}`, payload);
  },
  dispatch(msg: string, data?: unknown): void {
    writeLine("info", "DISPATCH", msg, data);
  },
};
