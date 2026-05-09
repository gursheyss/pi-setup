import { defineTool, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

export default function labelToolExtension(pi: ExtensionAPI) {
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
