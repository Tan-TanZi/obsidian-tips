import type { Snippet, SnippetTable } from '../types';
import { isValidIdentifier, matchScore } from './store';

/**
 * 插件可以随包附带这个文件，把自己作者的参考模板一起分发。
 * 形如 { "mechanism": [ { "name": "四连杆机构", "body": "type: fourbar" } ] }。
 */
export const BUNDLED_SNIPPET_FILE = 'tips.json';

/** 首行的围栏：``` 或 ~~~，可以带语言名 */
const OPENING_FENCE_RE = /^\s*(`{3,}|~{3,})[^\s`~]*\s*$/;
/** 末行的围栏：只有围栏字符和空白 */
const CLOSING_FENCE_RE = /^\s*(`{3,}|~{3,})\s*$/;

/** 去掉首尾空行 */
function trimBlankEdges(text: string): string {
	return text.replace(/^\n+/, '').replace(/\n+$/, '');
}

/**
 * 去掉整段内容外层的围栏。
 *
 * 只处理「首行是围栏、末行也是围栏」这种整体包裹的写法；只有一边像围栏时按普通内容处理，
 * 这样用户粘贴的代码里若正好有一行 ``` 也不会被误删。
 */
export function stripFence(text: string): string {
	// 防御：data.json 被手工改坏时可能塞进非字符串
	if (typeof text !== 'string') return '';
	const normalized = text.replace(/\r\n?/g, '\n');
	const lines = normalized.split('\n');

	if (lines.length >= 2) {
		const first = lines[0] ?? '';
		const last = lines[lines.length - 1] ?? '';
		if (OPENING_FENCE_RE.test(first) && CLOSING_FENCE_RE.test(last)) {
			return trimBlankEdges(lines.slice(1, -1).join('\n'));
		}
	}
	return trimBlankEdges(normalized);
}

/** 条目的唯一指纹，用于判定「名字和内容都一样」 */
export function snippetKey(snippet: Snippet): string {
	return `${snippet.name}\u0000${snippet.body}`;
}

/**
 * 规范化内容模板表：丢弃结构非法、名称为空、内容为空的条目，
 * 以及同一标识符下完全重复的条目。始终返回全新对象，不与入参共享引用。
 */
export function normalizeSnippets(value: unknown): SnippetTable {
	const result: SnippetTable = {};
	if (!value || typeof value !== 'object' || Array.isArray(value)) return result;

	for (const [rawKey, list] of Object.entries(value as Record<string, unknown>)) {
		const identifier = rawKey.trim();
		if (identifier.length === 0 || !Array.isArray(list)) continue;

		const entries: Snippet[] = [];
		const seen = new Set<string>();
		for (const item of list) {
			if (!item || typeof item !== 'object') continue;
			const raw = item as Partial<Snippet>;
			const name = typeof raw.name === 'string' ? raw.name.trim() : '';
			const body = typeof raw.body === 'string' ? stripFence(raw.body) : '';
			// 内容只由空白组成时视为空：stripFence 只去空行，不去空格（代码缩进有意义）
			if (name.length === 0 || body.trim().length === 0) continue;

			const key = snippetKey({ name, body });
			if (seen.has(key)) continue;
			seen.add(key);
			entries.push({ name, body });
		}

		if (entries.length > 0) result[identifier] = entries;
	}
	return result;
}

/** 复制一份内容模板表，避免调用方之间共享引用 */
export function cloneSnippetTable(table: SnippetTable): SnippetTable {
	const result: SnippetTable = {};
	for (const [identifier, list] of Object.entries(table)) {
		result[identifier] = list.map((item) => ({ name: item.name, body: item.body }));
	}
	return result;
}

export function countSnippets(table: SnippetTable, identifier: string): number {
	return table[identifier]?.length ?? 0;
}

export function totalSnippets(table: SnippetTable): number {
	let total = 0;
	for (const list of Object.values(table)) total += list.length;
	return total;
}

/**
 * 按过滤词筛选条目。只匹配名称——正文往往有几十行，参与匹配既慢又难出有意义的结果。
 */
export function filterSnippets(items: Snippet[], query: string): Snippet[] {
	const trimmed = query.trim();
	if (trimmed.length === 0) return items;

	const ranked: Array<{ item: Snippet; rank: number }> = [];
	for (const item of items) {
		const rank = matchScore(trimmed, item.name);
		if (rank >= 0) ranked.push({ item, rank });
	}
	ranked.sort((a, b) => b.rank - a.rank);
	return ranked.map((entry) => entry.item);
}

// —— 导出 / 提取 ——

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** 导出 / 导入时的三组模板 */
export interface ParsedSnippetFile {
	/** 插件注册的代码块所用的模板 */
	plugins: SnippetTable;
	/** Obsidian 自带处理器（mermaid / math / query）所用的模板 */
	builtin: SnippetTable;
	/** 用户自定义条目所用的模板 */
	custom: SnippetTable;
}

/** 导出时用来判断归属的两类标识符 */
export interface SnippetGroups {
	/** 插件注册的代码块 */
	plugins: ReadonlySet<string>;
	/** Obsidian 自带处理器 */
	builtin: ReadonlySet<string>;
}

/**
 * 导出为 JSON，按 plugins / builtin / custom 分三组：
 * 插件与内置两组接收方只会「有就收、没有就跳过」，自定义组则由用户决定要不要。
 * 空组会被省略。
 */
export function stringifySnippets(table: SnippetTable, groups: SnippetGroups): string {
	const plugins: SnippetTable = {};
	const builtin: SnippetTable = {};
	const custom: SnippetTable = {};

	for (const [identifier, list] of Object.entries(table)) {
		const target = groups.plugins.has(identifier)
			? plugins
			: groups.builtin.has(identifier)
				? builtin
				: custom;
		target[identifier] = list.map((item) => ({ name: item.name, body: item.body }));
	}

	const out: Record<string, SnippetTable> = {};
	if (Object.keys(plugins).length > 0) out['plugins'] = plugins;
	if (Object.keys(builtin).length > 0) out['builtin'] = builtin;
	if (Object.keys(custom).length > 0) out['custom'] = custom;
	return JSON.stringify(out, null, 2);
}

/** 解析导出的模板文件：{ "plugins": {…}, "builtin": {…}, "custom": {…} } */
export function parseSnippetFile(value: unknown): ParsedSnippetFile {
	if (!isPlainObject(value)) return { plugins: {}, builtin: {}, custom: {} };
	return {
		plugins: normalizeSnippets(value['plugins']),
		builtin: normalizeSnippets(value['builtin']),
		custom: normalizeSnippets(value['custom']),
	};
}

// —— 导入 ——

export interface ImportOutcome {
	/** 合并后的新表（原表不被修改） */
	table: SnippetTable;
	/** 实际新增的条目数 */
	added: number;
	/** 因完全相同而跳过的条目数 */
	duplicates: number;
	/** 因当前没有该标识符而整段跳过的标识符（仅指插件组） */
	skippedIdentifiers: string[];
	/** 因「不导入自定义模板」开关而跳过的条目数 */
	skippedCustom: number;
	/**
	 * 自定义组里当前不存在、需要顺带补建的标识符。
	 * 由调用方写进「自定义代码块条目」（备注留空），这样模板才有地方落。
	 */
	createdCustomIdentifiers: string[];
}

export interface ImportOptions {
	/** 当前已知的全部标识符（插件 + 内置 + 自定义 + 插件附带） */
	known: ReadonlySet<string>;
	/** 是否导入非插件（自定义）那一组 */
	includeCustom: boolean;
}

/**
 * 把导入的数据合并进现有模板表。
 *
 * 追加语义：不覆盖任何现有条目，完全相同的条目跳过。
 * 三组标识符的处理方式各不相同：
 * - **插件组 / 内置组**：标识符必须是当前已知的，否则整段跳过（有就导入、没有就跳过）；
 * - **自定义组**：受 includeCustom 开关控制。开关打开时，即使标识符还没被创建过，
 *   也会记入 createdCustomIdentifiers 交由调用方补建——分享者用的是自己的私有代码块，
 *   接收方这边自然还没有这个条目，不补建的话模板无处安放。
 */
export function mergeImport(
	incoming: unknown,
	current: SnippetTable,
	options: ImportOptions,
): ImportOutcome {
	const table = cloneSnippetTable(current);
	const skippedIdentifiers: string[] = [];
	const createdCustomIdentifiers: string[] = [];
	let added = 0;
	let duplicates = 0;
	let skippedCustom = 0;

	const parsed = parseSnippetFile(incoming);
	const groups: Array<{ source: SnippetTable; isCustom: boolean }> = [
		{ source: parsed.plugins, isCustom: false },
		{ source: parsed.builtin, isCustom: false },
		{ source: parsed.custom, isCustom: true },
	];

	for (const group of groups) {
		for (const [identifier, list] of Object.entries(group.source)) {
			// 只有自定义组受开关控制
			if (group.isCustom && !options.includeCustom) {
				skippedCustom += list.length;
				continue;
			}

			if (!options.known.has(identifier)) {
				if (!group.isCustom) {
					// 插件组 / 内置组：当前没有这个条目，跳过
					if (!skippedIdentifiers.includes(identifier)) skippedIdentifiers.push(identifier);
					continue;
				}
				// 自定义组：先确认这个标识符本身合法，再登记待补建
				if (!isValidIdentifier(identifier)) {
					if (!skippedIdentifiers.includes(identifier)) skippedIdentifiers.push(identifier);
					continue;
				}
				if (!createdCustomIdentifiers.includes(identifier)) {
					createdCustomIdentifiers.push(identifier);
				}
			}

			let target = table[identifier];
			if (!target) {
				target = [];
				table[identifier] = target;
			}
			const existing = new Set(target.map(snippetKey));

			for (const item of list) {
				const key = snippetKey(item);
				if (existing.has(key)) {
					duplicates++;
					continue;
				}
				existing.add(key);
				target.push(item);
				added++;
			}
		}
	}

	return { table, added, duplicates, skippedIdentifiers, skippedCustom, createdCustomIdentifiers };
}
