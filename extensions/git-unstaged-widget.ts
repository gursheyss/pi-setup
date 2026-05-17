import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const WIDGET_ID = "git-unstaged-widget";
const POLL_INTERVAL_MS = 2_000;

const BASE_CANDIDATES = ["origin/main", "origin/master", "main", "master"];

type GitSummary = {
	stagedFiles: number;
	unstagedFiles: number;
	untrackedFiles: number;
	aheadOfBase: number;
	added: number;
	removed: number;
};

type DiffSummary = {
	files: number;
	added: number;
	removed: number;
};

type WidgetTheme = {
	fg: (color: "accent" | "muted" | "success" | "warning" | "toolDiffAdded" | "toolDiffRemoved", text: string) => string;
};

async function runGit(cwd: string, args: string[]) {
	const { stdout } = await execFileAsync("git", args, {
		cwd,
		timeout: 1_500,
		maxBuffer: 1024 * 1024,
	});
	return stdout.trimEnd();
}

async function tryGit(cwd: string, args: string[]) {
	try {
		return await runGit(cwd, args);
	} catch {
		return undefined;
	}
}

function countStatus(status: string) {
	return status.split("\n").filter(Boolean).reduce(
		(summary, line) => {
			if (line.startsWith("??")) {
				return { ...summary, untrackedFiles: summary.untrackedFiles + 1 };
			}

			const [indexStatus = " ", worktreeStatus = " "] = line;

			return {
				stagedFiles: summary.stagedFiles + (indexStatus !== " " ? 1 : 0),
				unstagedFiles: summary.unstagedFiles + (worktreeStatus !== " " ? 1 : 0),
				untrackedFiles: summary.untrackedFiles,
			};
		},
		{ stagedFiles: 0, unstagedFiles: 0, untrackedFiles: 0 },
	);
}

function parseDiffStat(numstat: string) {
	return numstat.split("\n").filter(Boolean).reduce(
		(summary, line) => {
			const [added, removed] = line.split("\t");
			const addedCount = Number(added);
			const removedCount = Number(removed);

			return {
				files: summary.files + 1,
				added: summary.added + (Number.isFinite(addedCount) ? addedCount : 0),
				removed: summary.removed + (Number.isFinite(removedCount) ? removedCount : 0),
			};
		},
		{ files: 0, added: 0, removed: 0 } satisfies DiffSummary,
	);
}

async function getBaseRef(cwd: string) {
	const upstream = await tryGit(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
	const candidates = [...BASE_CANDIDATES, upstream].filter((candidate): candidate is string => Boolean(candidate));

	for (const candidate of candidates) {
		const exists = await tryGit(cwd, ["rev-parse", "--verify", candidate]);
		if (exists) return candidate;
	}

	return undefined;
}

async function countAheadOfBase(cwd: string) {
	const baseRef = await getBaseRef(cwd);
	if (!baseRef) return 0;

	const forkPoint = await tryGit(cwd, ["merge-base", "--fork-point", baseRef, "HEAD"]);
	const mergeBase = forkPoint ?? (await tryGit(cwd, ["merge-base", baseRef, "HEAD"]));
	if (!mergeBase) return 0;

	const count = await tryGit(cwd, ["rev-list", "--count", `${mergeBase}..HEAD`]);
	return Number(count ?? 0) || 0;
}

async function getSummary(cwd: string): Promise<GitSummary> {
	const [status, numstat, aheadOfBase] = await Promise.all([
		runGit(cwd, ["status", "--porcelain=v1"]),
		runGit(cwd, ["diff", "--numstat"]),
		countAheadOfBase(cwd),
	]);

	const counts = countStatus(status);
	const diff = parseDiffStat(numstat);

	return {
		...counts,
		aheadOfBase,
		added: diff.added,
		removed: diff.removed,
	};
}

function formatSummary(summary: GitSummary, theme: WidgetTheme) {
	const parts = [
		summary.aheadOfBase > 0 ? theme.fg("accent", `↑${summary.aheadOfBase}`) : undefined,
		summary.stagedFiles > 0 ? theme.fg("success", `●${summary.stagedFiles}`) : undefined,
		summary.unstagedFiles > 0 ? theme.fg("warning", `✎${summary.unstagedFiles}`) : undefined,
		summary.untrackedFiles > 0 ? theme.fg("muted", `?${summary.untrackedFiles}`) : undefined,
		summary.added > 0 ? theme.fg("toolDiffAdded", `+${summary.added}`) : undefined,
		summary.removed > 0 ? theme.fg("toolDiffRemoved", `-${summary.removed}`) : undefined,
	].filter((part): part is string => Boolean(part));

	return parts.length > 0 ? parts.join(" ") : undefined;
}

export default function gitUnstagedWidget(pi: ExtensionAPI) {
	let interval: NodeJS.Timeout | undefined;
	let lastLine: string | undefined;

	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;

		const update = async () => {
			try {
				const line = formatSummary(await getSummary(ctx.cwd), ctx.ui.theme);
				if (line === lastLine) return;

				lastLine = line;
				ctx.ui.setWidget(WIDGET_ID, line ? [line] : undefined, { placement: "belowEditor" });
			} catch {
				if (lastLine === undefined) return;
				lastLine = undefined;
				ctx.ui.setWidget(WIDGET_ID, undefined, { placement: "belowEditor" });
			}
		};

		void update();
		interval = setInterval(() => void update(), POLL_INTERVAL_MS);
	});

	pi.on("session_shutdown", () => {
		if (interval) clearInterval(interval);
		interval = undefined;
		lastLine = undefined;
	});
}
