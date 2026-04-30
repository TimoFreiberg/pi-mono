import { Box, Container, Spacer, Text } from "@mariozechner/pi-tui";
import { theme } from "../theme/theme.js";
import { keyHint } from "./keybinding-hints.js";
import type { ToolExecutionComponent } from "./tool-execution.js";

export type ExploreToolName = "read" | "grep" | "find";

export function isExploreToolName(name: string): name is ExploreToolName {
	return name === "read" || name === "grep" || name === "find";
}

interface ExploreEntry {
	toolCallId: string;
	tool: ExploreToolName;
	component: ToolExecutionComponent;
}

/**
 * Container that folds consecutive read/grep/find tool calls into one compact
 * single-line summary ("Searched for N patterns, read M files"). Expands to
 * render each underlying tool execution component normally.
 */
export class ExploreGroupComponent extends Container {
	private readonly entries: ExploreEntry[] = [];
	private readonly spacer = new Spacer(1);
	private readonly summaryBox: Box;
	private readonly summaryText = new Text("", 0, 0);
	private expanded = false;
	private lastSummaryKey = "";

	constructor() {
		super();
		this.summaryBox = new Box(1, 1, (t) => theme.bg("toolSuccessBg", t));
		this.summaryBox.addChild(this.summaryText);
	}

	addEntry(toolCallId: string, tool: ExploreToolName, component: ToolExecutionComponent): void {
		component.setExpanded(this.expanded);
		this.entries.push({ toolCallId, tool, component });
		// Track as child so invalidate() and the component tree see the entry.
		this.children.push(component);
		this.lastSummaryKey = "";
	}

	setExpanded(expanded: boolean): void {
		if (this.expanded === expanded) return;
		this.expanded = expanded;
		for (const e of this.entries) e.component.setExpanded(expanded);
		this.lastSummaryKey = "";
	}

	override invalidate(): void {
		this.lastSummaryKey = "";
		this.summaryBox.invalidate();
		for (const e of this.entries) e.component.invalidate?.();
	}

	override render(width: number): string[] {
		if (this.expanded) {
			const lines: string[] = [];
			for (const e of this.entries) {
				for (const line of e.component.render(width)) lines.push(line);
			}
			return lines;
		}

		this.summaryBox.setBgFn(this.pickBgFn());
		this.refreshSummary();
		return [...this.spacer.render(width), ...this.summaryBox.render(width)];
	}

	private pickBgFn(): (t: string) => string {
		for (const e of this.entries) {
			if (e.component.hasError()) return (t) => theme.bg("toolErrorBg", t);
		}
		return (t) => theme.bg("toolSuccessBg", t);
	}

	private refreshSummary(): void {
		let reads = 0;
		let searches = 0;
		let anyError = false;
		for (const e of this.entries) {
			if (e.component.hasError()) anyError = true;
			if (e.tool === "read") reads++;
			else searches++;
		}
		const key = `${reads}:${searches}:${anyError ? "1" : "0"}`;
		if (key === this.lastSummaryKey) return;
		this.lastSummaryKey = key;

		const parts: string[] = [];
		if (searches > 0) parts.push(`Searched for ${searches} ${searches === 1 ? "pattern" : "patterns"}`);
		if (reads > 0) parts.push(`read ${reads} ${reads === 1 ? "file" : "files"}`);
		const summary = parts.join(", ");
		const colored = anyError ? theme.fg("error", summary) : theme.fg("toolTitle", theme.bold(summary));
		const hint = keyHint("app.tools.expand", "to expand");
		this.summaryText.setText(`${colored} ${hint}`);
	}
}
