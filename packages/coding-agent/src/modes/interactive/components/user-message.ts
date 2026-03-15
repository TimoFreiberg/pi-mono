import { Box, Container, Markdown, type MarkdownTheme } from "@mariozechner/pi-tui";
import { getMarkdownTheme, theme } from "../theme/theme.js";

const OSC133_PROMPT_START = "\x1b]133;A\x07";
const OSC133_PROMPT_END = "\x1b]133;B\x07";
const OSC133_OUTPUT_END = "\x1b]133;D;0\x07";

/**
 * Component that renders a user message
 */
export class UserMessageComponent extends Container {
	private contentBox: Box;

	constructor(text: string, markdownTheme: MarkdownTheme = getMarkdownTheme()) {
		super();
		this.contentBox = new Box(1, 1, (content: string) => theme.bg("userMessageBg", content));
		this.contentBox.addChild(
			new Markdown(text, 0, 0, markdownTheme, {
				color: (content: string) => theme.fg("userMessageText", content),
			}),
		);
		this.addChild(this.contentBox);
	}

	override render(width: number): string[] {
		const lines = super.render(width);
		if (lines.length === 0) {
			return lines;
		}

		lines[0] = OSC133_OUTPUT_END + OSC133_PROMPT_START + lines[0];
		lines[lines.length - 1] = lines[lines.length - 1] + OSC133_PROMPT_END;
		return lines;
	}
}
