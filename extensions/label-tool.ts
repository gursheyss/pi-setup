import { defineTool, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

function titleFromPrompt(prompt: string): string {
	const cleaned = prompt
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`[^`]*`/g, " ")
		.replace(/https?:\/\/\S+/g, " ")
		.replace(/[^\p{L}\p{N}\s/_-]/gu, " ")
		.replace(/\s+/g, " ")
		.trim();

	if (!cleaned) return "New Session";

	const words = cleaned.split(" ").slice(0, 6);
	const title = words.join(" ");
	return title.length > 60 ? `${title.slice(0, 57).trim()}...` : title;
}

export default function labelToolExtension(pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event) => {
		if (pi.getSessionName()) return;
		pi.setSessionName(titleFromPrompt(event.prompt));
	});

	pi.registerCommand("name", {
		description: "Set or show the current session name (usage: /name [new name])",
		handler: async (args, ctx) => {
			const name = args.trim();
			if (!name) {
				const current = pi.getSessionName();
				ctx.ui.notify(current ? `Session: ${current}` : "No session name set", "info");
				return;
			}

			pi.setSessionName(name);
			ctx.ui.notify(`Session named: ${name}`, "info");
		},
	});

	const setSessionNameTool = defineTool({
		name: "set_session_name",
		label: "Set Session Name",
		description:
			"Set the current session's display name. Use this when the user asks you to name, rename, title, or label the current session.",
		promptSnippet: "Set the current session's display name",
		promptGuidelines: [
			"Use set_session_name when the user asks to name or rename the current session.",
			"Pick a short, descriptive title unless the user specifies an exact name.",
		],
		parameters: Type.Object({
			name: Type.String({
				description: "The new display name for the current session",
				minLength: 1,
			}),
		}),
		async execute(_toolCallId, params) {
			const name = params.name.trim();

			if (!name) {
				return {
					content: [{ type: "text", text: "Failed to set session name: name cannot be empty." }],
					details: { ok: false, name: "" },
				};
			}

			pi.setSessionName(name);

			return {
				content: [{ type: "text", text: `Session name set to: ${name}` }],
				details: { ok: true, name },
			};
		},
	});

	pi.registerTool(setSessionNameTool);
}
