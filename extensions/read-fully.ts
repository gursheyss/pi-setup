/**
 * Quiet nudge: after repeated search/navigation without a real read, remind the
 * agent to read source files with enough context. Quiet mode is model-only.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const SEARCH_PATTERN = /\b(rg|grep|egrep|fgrep|zgrep|bzgrep|xzgrep|ag|ack|pt|sift|ucg)\b/;
const READ_PATTERN = /\b(cat|less|more|bat|sed|awk|head|tail)\b/;
const SEARCH_TOOLS = new Set(["grep", "find", "ls", "search_code", "find_files", "list_dir"]);
const READ_TOOLS = new Set(["read", "read_code"]);

const SEARCHES_BEFORE_NUDGE = 2;

type Mode = "off" | "quiet" | "strict";

export default function (pi: ExtensionAPI) {
	let mode: Mode = "quiet";
	let searchesSinceRead = 0;
	let remindedThisRun = false;

	pi.registerCommand("read-reminders", {
		description: "Set read-full reminder mode: off, quiet, or strict",
		handler: async (args, ctx) => {
			const next = args.trim() as Mode;
			if (!["off", "quiet", "strict"].includes(next)) {
				ctx.ui.notify(`read-reminders is ${mode}. Usage: /read-reminders off|quiet|strict`, "info");
				return;
			}
			mode = next;
			ctx.ui.notify(`read-reminders set to ${mode}`, "info");
		},
	});

	pi.on("agent_start", async () => {
		searchesSinceRead = 0;
		remindedThisRun = false;
	});

	pi.on("tool_result", async (event) => {
		if (READ_TOOLS.has(event.toolName)) {
			searchesSinceRead = 0;
			return;
		}

		if (event.toolName === "bash") {
			const cmd = (event.input as any)?.command ?? "";
			if (READ_PATTERN.test(cmd)) {
				searchesSinceRead = 0;
				return;
			}
			if (SEARCH_PATTERN.test(cmd)) searchesSinceRead++;
			return;
		}

		if (SEARCH_TOOLS.has(event.toolName)) searchesSinceRead++;
	});

	pi.on("agent_end", async () => {
		if (mode === "off") return;
		if (remindedThisRun) return;
		if (searchesSinceRead < SEARCHES_BEFORE_NUDGE) return;
		remindedThisRun = true;

		pi.sendMessage(
			{
				customType: "read-fully-steer",
				content:
					"Reminder: search/list tools locate files, but snippets miss context. If you are about to answer or edit based on search results, first use read_code/read to inspect the relevant file(s) with enough surrounding context.",
				display: mode === "strict",
			},
			{ deliverAs: "followUp", triggerTurn: true },
		);
	});
}
