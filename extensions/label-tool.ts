import { complete } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const SUMMARY_PROMPT =
	"Summarize the user's request in 5-10 words max. Output ONLY the summary, nothing else. No quotes, no punctuation at the end.";
const SESSION_NAME_PROVIDER = "openai-codex";
const SESSION_NAME_MODEL_ID = "gpt-5.4-mini";

function fallbackTitle(prompt: string): string {
	const cleaned = prompt
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`[^`]*`/g, " ")
		.replace(/https?:\/\/\S+/g, " ")
		.replace(/\s+/g, " ")
		.trim();

	return cleaned.slice(0, 60).trim() || "New Session";
}

function setSessionNameSafely(pi: ExtensionAPI, name: string): string | undefined {
	try {
		pi.setSessionName(name);
		return undefined;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}

async function summarizeWithModel(
	ctx: ExtensionContext,
	model: NonNullable<ExtensionContext["model"]>,
	prompt: string,
): Promise<string | undefined> {
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) return undefined;

	try {
		const response = await complete(
			model,
			{
				systemPrompt: SUMMARY_PROMPT,
				messages: [{ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }],
			},
			{ apiKey: auth.apiKey, headers: auth.headers },
		);

		const summary = response.content
			.filter((content): content is { type: "text"; text: string } => content.type === "text")
			.map((content) => content.text)
			.join("")
			.trim()
			.replace(/[.!?]+$/, "");

		return summary || undefined;
	} catch {
		return undefined;
	}
}

async function summarizePrompt(ctx: ExtensionContext, prompt: string): Promise<string | undefined> {
	const preferredModel = ctx.modelRegistry.find(SESSION_NAME_PROVIDER, SESSION_NAME_MODEL_ID);
	if (preferredModel) {
		const summary = await summarizeWithModel(ctx, preferredModel, prompt);
		if (summary) return summary;
	}

	if (!ctx.model || ctx.model === preferredModel) return undefined;
	return summarizeWithModel(ctx, ctx.model, prompt);
}

export default function labelToolExtension(pi: ExtensionAPI) {
	let named = false;
	let labelRunId = 0;

	pi.on("session_start", () => {
		labelRunId += 1;
		named = !!pi.getSessionName();
	});

	pi.on("input", (event, ctx) => {
		if (named) return;

		const prompt = event.text.trim();
		if (!prompt) return;

		named = true;
		const currentLabelRunId = labelRunId + 1;
		labelRunId = currentLabelRunId;
		setSessionNameSafely(pi, fallbackTitle(prompt));

		void summarizePrompt(ctx, prompt)
			.then((summary) => {
				if (summary && labelRunId === currentLabelRunId) setSessionNameSafely(pi, summary);
			})
			.catch(() => undefined);
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

			labelRunId += 1;
			const error = setSessionNameSafely(pi, name);
			if (error) {
				return {
					content: [{ type: "text", text: `Failed to set session name: ${error}` }],
					details: { ok: false, name },
				};
			}

			named = true;

			return {
				content: [{ type: "text", text: `Session name set to: ${name}` }],
				details: { ok: true, name },
			};
		},
	});

	pi.registerTool(setSessionNameTool);
}
