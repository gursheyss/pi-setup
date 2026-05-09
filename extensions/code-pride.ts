/**
 * Quiet nudge: after source edits, remind the agent to reread/self-review only
 * when it has not already reread the edited files. Quiet mode is model-only.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const CODE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go|rb|java|kt|swift|c|cpp|h|hpp|cs|lua|zig|sh|bash|zsh|vue|svelte|astro|css|scss|html)$/;
const READ_TOOLS = new Set(["read", "read_code"]);

type Mode = "off" | "quiet" | "strict";

function normalizePath(path: unknown) {
	return String(path ?? "").replace(/^@/, "");
}

function isSameOrSuffix(readPath: string, editedPath: string) {
	return readPath === editedPath || readPath.endsWith(`/${editedPath}`) || editedPath.endsWith(`/${readPath}`);
}

export default function (pi: ExtensionAPI) {
	let mode: Mode = "quiet";
	let editedPaths = new Set<string>();
	let rereadPaths = new Set<string>();
	let remindedThisRun = false;

	function unreadEditedPaths() {
		return [...editedPaths].filter((edited) => ![...rereadPaths].some((read) => isSameOrSuffix(read, edited)));
	}

	pi.registerCommand("code-pride", {
		description: "Set edited-code reread reminder mode: off, quiet, or strict",
		handler: async (args, ctx) => {
			const next = args.trim() as Mode;
			if (!["off", "quiet", "strict"].includes(next)) {
				ctx.ui.notify(`code-pride is ${mode}. Usage: /code-pride off|quiet|strict`, "info");
				return;
			}
			mode = next;
			ctx.ui.notify(`code-pride set to ${mode}`, "info");
		},
	});

	pi.on("agent_start", async () => {
		editedPaths = new Set();
		rereadPaths = new Set();
		remindedThisRun = false;
	});

	pi.on("tool_result", async (event) => {
		if (event.toolName === "write" || event.toolName === "Write" || event.toolName === "edit" || event.toolName === "Edit") {
			const path = normalizePath((event.input as any)?.path);
			if (CODE_EXTENSIONS.test(path)) editedPaths.add(path);
			return;
		}

		if (READ_TOOLS.has(event.toolName)) {
			const path = normalizePath((event.input as any)?.path);
			if (path) rereadPaths.add(path);
		}
	});

	pi.on("agent_end", async () => {
		if (mode === "off") return;
		if (remindedThisRun) return;

		const paths = unreadEditedPaths();
		if (paths.length === 0) return;
		remindedThisRun = true;

		const shown = paths.slice(0, 5).map((p) => `\`${p}\``).join(", ");
		const more = paths.length > 5 ? ` and ${paths.length - 5} more` : "";

		pi.sendMessage(
			{
				customType: "code-pride-steer",
				content: `Reminder: before finishing, reread and self-review edited source file(s): ${shown}${more}. Make sure the final code is clean, coherent, and something you'd be proud to ship.`,
				display: mode === "strict",
			},
			{ deliverAs: "followUp", triggerTurn: true },
		);
	});
}
