import { Box, Container, Spacer, Text, visibleWidth } from "@mariozechner/pi-tui";
import { shortenPath, str } from "../../../core/tools/render-utils.js";
import { theme } from "../theme/theme.js";
import type { ToolExecutionComponent } from "./tool-execution.js";

interface ReadEntry {
	toolCallId: string;
	component: ToolExecutionComponent;
}

/**
 * Container that groups consecutive `read` tool calls into one compact block
 * showing only file paths (packed multiple per line). Expands to render each
 * underlying tool execution component normally.
 */
export class ReadGroupComponent extends Container {
	private readonly entries: ReadEntry[] = [];
	private readonly spacer = new Spacer(1);
	private readonly summaryBox: Box;
	private readonly summaryText = new Text("", 0, 0);
	private expanded = false;
	private lastPackedKey = "";

	constructor() {
		super();
		this.summaryBox = new Box(1, 1, (t) => theme.bg("toolSuccessBg", t));
		this.summaryBox.addChild(this.summaryText);
	}

	addEntry(toolCallId: string, component: ToolExecutionComponent): void {
		component.setExpanded(this.expanded);
		this.entries.push({ toolCallId, component });
		// Track in container so invalidate() propagates and child components
		// participate in the component tree (used elsewhere via children).
		this.children.push(component);
		this.lastPackedKey = "";
	}

	setExpanded(expanded: boolean): void {
		if (this.expanded === expanded) return;
		this.expanded = expanded;
		for (const e of this.entries) e.component.setExpanded(expanded);
		this.lastPackedKey = "";
	}

	override invalidate(): void {
		this.lastPackedKey = "";
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
		this.refreshSummary(width);
		return [...this.spacer.render(width), ...this.summaryBox.render(width)];
	}

	private pickBgFn(): (t: string) => string {
		for (const e of this.entries) {
			if (e.component.hasError()) return (t) => theme.bg("toolErrorBg", t);
		}
		return (t) => theme.bg("toolSuccessBg", t);
	}

	private refreshSummary(width: number): void {
		const header = `${theme.fg("toolTitle", theme.bold("read"))} `; // visible width 5
		const indent = "     "; // 5 spaces, aligns continuation under paths
		const boxPadding = 1; // matches Box(1, 1) horizontal padding
		const prefixWidth = 5;
		const budget = Math.max(8, width - boxPadding * 2 - prefixWidth);

		const items = this.entries.map((e) => {
			const args = e.component.getArgs() ?? {};
			const raw = str(args.file_path ?? args.path) ?? "";
			const display = raw ? shortenPath(raw) : "...";
			const isError = e.component.hasError();
			const colored = isError ? theme.fg("error", display) : theme.fg("accent", display);
			return { display, colored, isError };
		});

		const key = `${width}:${items.map((i) => `${i.isError ? "!" : ""}${i.display}`).join("|")}`;
		if (key === this.lastPackedKey) return;
		this.lastPackedKey = key;

		const lines: string[] = [];
		let lineColored = "";
		let lineWidth = 0;
		for (const item of items) {
			const w = visibleWidth(item.display);
			if (lineColored === "") {
				lineColored = item.colored;
				lineWidth = w;
				continue;
			}
			if (lineWidth + 2 + w <= budget) {
				lineColored += `  ${item.colored}`;
				lineWidth += 2 + w;
			} else {
				lines.push(lineColored);
				lineColored = item.colored;
				lineWidth = w;
			}
		}
		if (lineColored) lines.push(lineColored);
		if (lines.length === 0) lines.push("");

		const rendered = lines.map((l, i) => (i === 0 ? header : indent) + l).join("\n");
		this.summaryText.setText(rendered);
	}
}
