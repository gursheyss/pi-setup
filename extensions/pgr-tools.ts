import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";

const DEFAULT_PGR = "/Users/gursh/.cargo/bin/pgr";
const EXTRA_PATHS = ["/Users/gursh/.cargo/bin", "/Users/gursh/.pi/agent/bin", "/opt/homebrew/bin", "/usr/local/bin"];
const MAX_OUTPUT_BYTES = 50 * 1024;
const MAX_OUTPUT_LINES = 2000;

type JsonRpcMessage = {
	jsonrpc?: string;
	id?: number | string;
	result?: unknown;
	error?: { code?: number; message?: string; data?: unknown };
};

async function commandExists(path: string) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function getPgrCommand() {
	return (process.env.PGR_COMMAND || (await commandExists(DEFAULT_PGR) ? DEFAULT_PGR : "pgr"));
}

function buildEnv() {
	const currentPath = process.env.PATH ?? "";
	return {
		...process.env,
		PATH: [...EXTRA_PATHS, currentPath].filter(Boolean).join(":"),
		PGR_OUTPUT_PROFILE: process.env.PGR_OUTPUT_PROFILE || "full_v4",
	};
}

function truncateOutput(text: string) {
	const lines = text.split("\n");
	let output = lines.slice(0, MAX_OUTPUT_LINES).join("\n");
	let truncated = lines.length > MAX_OUTPUT_LINES;

	const bytes = Buffer.byteLength(output, "utf8");
	if (bytes > MAX_OUTPUT_BYTES) {
		let current = 0;
		let end = 0;
		for (const [index, line] of output.split("\n").entries()) {
			const next = current + Buffer.byteLength(line + "\n", "utf8");
			if (next > MAX_OUTPUT_BYTES) break;
			current = next;
			end = index + 1;
		}
		output = output.split("\n").slice(0, Math.max(1, end)).join("\n");
		truncated = true;
	}

	if (truncated) {
		output += `\n\n[Output truncated by pgr-tools extension: limit ${MAX_OUTPUT_LINES} lines / ${MAX_OUTPUT_BYTES} bytes.]`;
	}
	return output;
}

function stringifyMcpContent(result: any): string {
	const content = result?.content;
	if (Array.isArray(content)) {
		const text = content
			.map((part) => {
				if (part?.type === "text" && typeof part.text === "string") return part.text;
				return JSON.stringify(part);
			})
			.join("\n");
		return truncateOutput(text);
	}
	if (typeof result === "string") return truncateOutput(result);
	return truncateOutput(JSON.stringify(result, null, 2));
}

async function callPgrTool(cwd: string, name: string, args: Record<string, unknown>, signal?: AbortSignal) {
	const command = await getPgrCommand();
	const child = spawn(command, [], {
		cwd,
		env: buildEnv(),
		stdio: ["pipe", "pipe", "pipe"],
	});

	let stdout = "";
	let stderr = "";
	let settled = false;

	const abort = () => {
		if (!settled) child.kill("SIGTERM");
	};
	signal?.addEventListener("abort", abort, { once: true });

	try {
		const done = new Promise<{ code: number | null }>((resolve, reject) => {
			child.on("error", reject);
			child.on("close", (code) => resolve({ code }));
		});

		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString("utf8");
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString("utf8");
		});

		const messages = [
			{ jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
			{ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } },
		];
		child.stdin.end(messages.map((message) => JSON.stringify(message)).join("\n") + "\n");

		const { code } = await done;
		settled = true;

		if (signal?.aborted) throw new Error("pgr call cancelled");
		if (code !== 0) throw new Error(`pgr exited with code ${code}${stderr ? `: ${stderr}` : ""}`);

		const responses = stdout
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => JSON.parse(line) as JsonRpcMessage);
		const response = responses.find((message) => message.id === 2);
		if (!response) throw new Error(`pgr did not return a tools/call response${stderr ? `: ${stderr}` : ""}`);
		if (response.error) throw new Error(response.error.message || JSON.stringify(response.error));
		return response.result;
	} finally {
		signal?.removeEventListener("abort", abort);
		if (!settled && !child.killed) child.kill("SIGTERM");
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "search_code",
		label: "Search Code",
		description: "Search repository file contents with pgr/ripgrep. Returns ranked matches with file paths and line numbers.",
		promptSnippet: "Search repository code contents with ranked pgr results",
		promptGuidelines: [
			"Use search_code instead of bash grep/rg for locating code by content.",
			"After search_code identifies relevant files, use read_code to read complete relevant files or complete line ranges before editing.",
		],
		parameters: Type.Object({
			query: Type.String({ description: "The search query, regex or literal string" }),
			path_glob: Type.Optional(Type.String({ description: "Glob pattern to filter files, e.g. **/*.ts" })),
			file_type: Type.Optional(Type.String({ description: "Ripgrep file type, e.g. rust, py, js, ts" })),
			max_files: Type.Optional(Type.Integer({ description: "Maximum files to return. Default: 10" })),
			max_matches_per_file: Type.Optional(Type.Integer({ description: "Maximum matches per file. Default: 3" })),
		}),
		async execute(_id, params, signal, _onUpdate, ctx) {
			const result = await callPgrTool(ctx.cwd, "search_code", params as Record<string, unknown>, signal);
			return { content: [{ type: "text", text: stringifyMcpContent(result) }], details: result };
		},
	});

	pi.registerTool({
		name: "read_code",
		label: "Read Code",
		description: "Read a repository file using pgr, with line numbers and optional range limits. Supports exact path or suffix matching.",
		promptSnippet: "Read repository files through pgr with line numbers",
		promptGuidelines: [
			"Use read_code to read files found by search_code/find_files/list_dir before making code changes.",
			"When the user asks to inspect a source file, prefer read_code with enough max_lines to understand imports, types, helpers, and control flow.",
		],
		parameters: Type.Object({
			path: Type.String({ description: "File path to read, exact path or suffix match. Leading @ is allowed." }),
			start_line: Type.Optional(Type.Integer({ description: "Starting line number, 1-indexed. Default: 1" })),
			end_line: Type.Optional(Type.Integer({ description: "Ending line number, 0 means auto based on max_lines. Default: 0" })),
			max_lines: Type.Optional(Type.Integer({ description: "Maximum lines to return. Default: 80" })),
		}),
		async execute(_id, params, signal, _onUpdate, ctx) {
			const normalized = { ...(params as any), path: String((params as any).path ?? "").replace(/^@/, "") };
			const result = await callPgrTool(ctx.cwd, "read_code", normalized, signal);
			return { content: [{ type: "text", text: stringifyMcpContent(result) }], details: result };
		},
	});

	pi.registerTool({
		name: "find_files",
		label: "Find Files",
		description: "Find repository files with pgr/ripgrep file listing and optional substring/glob/type filters.",
		promptSnippet: "Find repository files by name, glob, or file type",
		promptGuidelines: ["Use find_files instead of shell find/ls for locating repository files by path or type."],
		parameters: Type.Object({
			pattern: Type.Optional(Type.String({ description: "Case-insensitive substring filter for paths" })),
			glob: Type.Optional(Type.String({ description: "Glob pattern, e.g. **/*.ts" })),
			file_type: Type.Optional(Type.String({ description: "Ripgrep file type, e.g. rust, py, js, ts" })),
			max_results: Type.Optional(Type.Integer({ description: "Maximum results. Default: 50" })),
		}),
		async execute(_id, params, signal, _onUpdate, ctx) {
			const result = await callPgrTool(ctx.cwd, "find_files", params as Record<string, unknown>, signal);
			return { content: [{ type: "text", text: stringifyMcpContent(result) }], details: result };
		},
	});

	pi.registerTool({
		name: "list_dir",
		label: "List Directory",
		description: "List repository directory contents through pgr.",
		promptSnippet: "List repository directories through pgr",
		promptGuidelines: ["Use list_dir instead of shell ls for exploring repository directories."],
		parameters: Type.Object({
			path: Type.Optional(Type.String({ description: "Directory path. Default: . Leading @ is allowed." })),
			recursive: Type.Optional(Type.Boolean({ description: "Whether to list recursively. Default: false" })),
			max_results: Type.Optional(Type.Integer({ description: "Maximum entries. Default: 100" })),
		}),
		async execute(_id, params, signal, _onUpdate, ctx) {
			const normalized = { ...(params as any) };
			if (typeof normalized.path === "string") normalized.path = normalized.path.replace(/^@/, "");
			const result = await callPgrTool(ctx.cwd, "list_dir", normalized, signal);
			return { content: [{ type: "text", text: stringifyMcpContent(result) }], details: result };
		},
	});

	pi.registerCommand("pgr-tools", {
		description: "Switch active tools to pgr search/read/list plus Pi bash/edit/write",
		handler: async (_args, ctx) => {
			pi.setActiveTools(["search_code", "read_code", "find_files", "list_dir", "bash", "edit", "write"]);
			ctx.ui.notify("pgr tools enabled; Pi read/grep/find/ls disabled for this session.", "info");
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		pi.setActiveTools(["search_code", "read_code", "find_files", "list_dir", "bash", "edit", "write"]);
		ctx.ui.setStatus("pgr", "pgr tools");
	});
}
