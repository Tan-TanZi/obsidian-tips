import type { Text } from '@codemirror/state';

/** 文档中一个围栏代码块的位置信息 */
export interface CodeBlockInfo {
	/** 起始围栏所在行号（1 起） */
	startLine: number;
	/** 结束围栏所在行号（1 起）；未闭合时等于文档最后一行 */
	endLine: number;
	/** info string 起点，相对起始行的行首偏移 */
	infoFrom: number;
	/** info string 终点，相对起始行的行首偏移 */
	infoTo: number;
	/** 当前 info string 内容（已去除首尾空白） */
	info: string;
	/** 围栏字符：` 或 ~ */
	fenceChar: string;
	/** 围栏长度 */
	fenceLen: number;
	/** 是否已出现配对的结束围栏 */
	closed: boolean;
}

/** 最多允许 3 个前导空格，其后是三个及以上反引号或波浪号 */
export const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/** 单次扫描的最大行数，避免超长文档每次输入都全量扫描 */
const SCAN_WINDOW_LINES = 3000;

/** 窗口起点向前回溯的行数，用于对齐到最近的围栏行 */
const SCAN_LOOKBEHIND = 200;

interface OpenBlock {
	startLine: number;
	fenceChar: string;
	fenceLen: number;
	infoFrom: number;
	infoTo: number;
	info: string;
}

/**
 * 收集 fromLine 到 upToLine 之间的围栏代码块。
 * 未闭合的围栏也会返回，这样用户刚敲下 ``` 时就能立刻用上。
 *
 * 超长文档只扫描末尾一段（约 3000 行），并向前对齐到最近的围栏行，
 * 避免每次按键都做一次全文档扫描。
 */
export function collectCodeBlocks(doc: Text, upToLine: number, fromLine = 1): CodeBlockInfo[] {
	const blocks: CodeBlockInfo[] = [];
	const limit = Math.min(Math.max(upToLine, 1), doc.lines);
	let start = Math.min(Math.max(fromLine, 1), limit);

	if (limit - start > SCAN_WINDOW_LINES) {
		start = limit - SCAN_WINDOW_LINES;
		const behind = Math.max(1, start - SCAN_LOOKBEHIND);
		for (let lineNumber = start; lineNumber >= behind; lineNumber--) {
			if (FENCE_RE.test(doc.line(lineNumber).text)) {
				start = lineNumber;
				break;
			}
		}
	}

	let open: OpenBlock | null = null;

	for (let lineNumber = start; lineNumber <= limit; lineNumber++) {
		const line = doc.line(lineNumber);
		const match = FENCE_RE.exec(line.text);
		if (!match) continue;

		const fence = match[1];
		const rest = match[2];
		if (!fence || rest === undefined) continue;
		const fenceChar = fence.charAt(0);
		if (fenceChar !== '`' && fenceChar !== '~') continue;

		if (!open) {
			// 反引号围栏的 info string 中不允许再出现反引号
			if (fenceChar === '`' && rest.includes('`')) continue;
			const afterFence = line.text.length - rest.length;
			const leading = rest.length - rest.trimStart().length;
			const infoFrom = afterFence + leading;
			const infoTo = afterFence + rest.trimEnd().length;
			open = {
				startLine: lineNumber,
				fenceChar,
				fenceLen: fence.length,
				infoFrom,
				infoTo,
				info: line.text.slice(infoFrom, infoTo),
			};
			continue;
		}

		// 结束围栏：字符相同、长度不短于起始围栏、其后只有空白
		if (fenceChar === open.fenceChar && fence.length >= open.fenceLen && rest.trim().length === 0) {
			blocks.push({ ...open, endLine: lineNumber, closed: true });
			open = null;
		}
	}

	if (open) {
		blocks.push({ ...open, endLine: doc.lines, closed: false });
	}
	return blocks;
}

/** 在已收集的代码块里，找出起始行等于 lineNumber 的那个。 */
export function blockStartingAtLine(blocks: CodeBlockInfo[], lineNumber: number): CodeBlockInfo | null {
	for (const block of blocks) {
		if (block.startLine === lineNumber) return block;
	}
	return null;
}

// —— 内容模板触发点 ——

/** 内容区第一个字符是 `?` 的代码块，可据此调出内容模板面板 */
export interface SnippetTrigger {
	/** 所属代码块 */
	block: CodeBlockInfo;
	/** `?` 之后的过滤词（未 trim） */
	query: string;
	/** 内容区起点，即替换范围的 from */
	contentFrom: number;
	/** 内容区终点，即替换范围的 to */
	contentTo: number;
	/** 结束围栏是否已存在 */
	closed: boolean;
}

/**
 * 判断光标是否处于「内容模板触发」状态。
 *
 * 规则（刻意收紧，避免误触）：代码块内容区的**第一个字符**必须是 `?`，前面不允许有空白。
 * 这样 `a ? b : c`、`# 有疑问?` 这类普通写法都不会触发。
 */
export function findSnippetTrigger(
	doc: Text,
	pos: number,
	blocks: CodeBlockInfo[],
): SnippetTrigger | null {
	const cursorLine = doc.lineAt(pos).number;

	for (const block of blocks) {
		// 光标要落在内容区里（起始围栏行之后）
		if (cursorLine <= block.startLine || cursorLine > block.endLine) continue;

		const firstContentLineNumber = block.startLine + 1;
		if (firstContentLineNumber > doc.lines || firstContentLineNumber > block.endLine) return null;

		const firstContentLine = doc.line(firstContentLineNumber);
		if (!firstContentLine.text.startsWith('?')) return null;

		const startFenceLine = doc.line(block.startLine);
		const contentFrom = Math.min(startFenceLine.to + 1, doc.length);
		const contentTo = block.closed ? doc.line(block.endLine).from : doc.length;
		if (contentFrom > contentTo) return null;

		return {
			block,
			query: firstContentLine.text.slice(1),
			contentFrom,
			contentTo,
			closed: block.closed,
		};
	}
	return null;
}

export interface SnippetReplacement {
	from: number;
	to: number;
	insert: string;
	/** 替换完成后光标应落到的位置 */
	cursor: number;
}

/** 计算把整个内容区替换成 body 所需的文档改动（围栏本身保持不动）。 */
export function snippetReplacement(trigger: SnippetTrigger, body: string): SnippetReplacement {
	// 末尾换行统一处理，避免与内容区自带的换行叠加出空行
	const cleaned = body.replace(/\n+$/, '');
	// 已闭合时，内容区末尾那个换行也在替换范围内，需要补回来
	const insert = trigger.closed ? `${cleaned}\n` : cleaned;
	return {
		from: trigger.contentFrom,
		to: trigger.contentTo,
		insert,
		cursor: trigger.contentFrom + cleaned.length,
	};
}
