/** Structured stdout + bounded local file logger. */
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const logDir = join(dirname(fileURLToPath(import.meta.url)), "../logs");
const logFile = join(logDir, "chalo.log");
try { if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true }); } catch {}

function writeLine(level: string, tag: string, message: string, data?: unknown): void {
  const meta = data === undefined ? "" : ` | ${typeof data === "string" ? data : JSON.stringify(data)}`;
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${tag}] ${message}${meta}\n`;
  (level === "error" ? process.stderr : process.stdout).write(line);
  try {
    if (existsSync(logFile) && statSync(logFile).size >= 5 * 1024 * 1024) {
      const rotated = `${logFile}.1`;
      if (existsSync(rotated)) rmSync(rotated);
      renameSync(logFile, rotated);
    }
    appendFileSync(logFile, line, "utf8");
  } catch {}
}

export const logger = {
  info: (tag: string, message: string, data?: unknown) => writeLine("info", tag, message, data),
  warn: (tag: string, message: string, data?: unknown) => writeLine("warn", tag, message, data),
  error(tag: string, message: string, error?: unknown): void {
    const data = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error;
    writeLine("error", tag, message, data);
  },
  http(method: string, url: string, status: number, durationMs: number, extra?: unknown): void {
    writeLine(status >= 500 ? "error" : status >= 400 ? "warn" : "info", "HTTP", `${method} ${url} -> ${status} (${durationMs.toFixed(1)}ms)`, extra);
  },
  ws(channel: "rider" | "driver", event: string, userId: string, payload?: unknown): void {
    writeLine("info", `WS:${channel.toUpperCase()}`, `${event} user=${userId.slice(0, 8)}`, payload);
  },
  dispatch: (message: string, data?: unknown) => writeLine("info", "DISPATCH", message, data),
};
