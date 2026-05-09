import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const WIDGET_ID = "unstaged-changes";
const REFRESH_MS = 2_000;

let interval: NodeJS.Timeout | undefined;
let lastText: string | undefined;
let refreshing = false;

async function countUnstagedFiles(cwd: string): Promise<number | null> {
	try {
		const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1"], {
			cwd,
			timeout: 2_000,
			maxBuffer: 1024 * 1024,
		});

		const files = new Set<string>();
		for (const line of stdout.split("\n")) {
			if (line.length < 2) continue;

			const indexStatus = line[0];
			const worktreeStatus = line[1];
			const isUntracked = indexStatus === "?" && worktreeStatus === "?";
			const hasUnstagedChange = worktreeStatus !== " " || isUntracked;
			if (!hasUnstagedChange) continue;

			const path = line.slice(3).trim();
			if (path.length > 0) files.add(path);
		}

		return files.size;
	} catch {
		return null;
	}
}

function formatCount(count: number | null): string | undefined {
	if (count === null) return undefined;
	if (count === 0) return "No unstaged files";
	return `${count} unstaged ${count === 1 ? "file" : "files"}`;
}

async function refresh(ctx: ExtensionContext): Promise<void> {
	if (refreshing) return;
	refreshing = true;
	try {
		const text = formatCount(await countUnstagedFiles(ctx.cwd));
		if (text === lastText) return;

		lastText = text;
		if (text === undefined) {
			ctx.ui.setWidget(WIDGET_ID, undefined);
			return;
		}

		ctx.ui.setWidget(WIDGET_ID, (_tui, theme) => ({
			render: (width: number) => [theme.fg("dim", text.slice(0, Math.max(0, width)))],
			invalidate: () => {},
		}), { placement: "aboveEditor" });
	} finally {
		refreshing = false;
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		lastText = undefined;
		await refresh(ctx);
		interval = setInterval(() => void refresh(ctx), REFRESH_MS);
		interval.unref?.();
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (interval) clearInterval(interval);
		interval = undefined;
		ctx.ui.setWidget(WIDGET_ID, undefined);
	});

	pi.on("tool_execution_end", async (_event, ctx) => {
		await refresh(ctx);
	});

	pi.on("user_bash", async (_event, ctx) => {
		setTimeout(() => void refresh(ctx), 100).unref?.();
	});
}
