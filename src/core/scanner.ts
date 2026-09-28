import { normalizePath, type App, type DataAdapter } from 'obsidian';

import type { SnippetTable } from '../types';
import { BUNDLED_SNIPPET_FILE, normalizeSnippets } from './snippets';

/** 从插件 main.js 中扫描出来的一个代码块处理器 */
export interface ScannedProcessor {
	/** 代码块标识符 */
	value: string;
	/** 注册它的插件 id */
	pluginId: string;
	/** 插件显示名 */
	pluginName: string;
	/** 该插件当前是否已启用 */
	enabled: boolean;
}

/** 使用了变量式注册、名字无法自动识别的插件 */
export interface UnparsedPlugin {
	pluginId: string;
	pluginName: string;
	/** 检出的变量式注册调用次数 */
	count: number;
}

export interface ScanResult {
	/** 成功提取到的代码块处理器 */
	processors: ScannedProcessor[];
	/** 存在变量式注册、需要用户手动补充的插件 */
	unparsed: UnparsedPlugin[];
}

/**
 * 匹配 registerMarkdownCodeBlockProcessor 的调用，形如：
 *
 * - `registerMarkdownCodeBlockProcessor("xxx", …)` → 第一个分支捕获字面量名字
 * - `registerMarkdownCodeBlockProcessor(nombre, …)` → 第二个分支只用于**察觉**这是变量式注册
 *
 * 变量式的名字是运行时才确定的（常见于把名字放在映射表里循环注册），静态分析无从推断，
 * 所以这里只记录「该插件有无法识别的注册」，交给用户手动补。
 */
const PROCESSOR_RE =
	/register(?:Markdown)?CodeBlockProcessor\s*\(\s*(?:(["'`])([^"'`\s]{1,64})\1|([A-Za-z_$][\w$]*)|([^\s)]))/g;

/** 匹配「变量名 = "字面量"」形式的赋值，用于把常量还原成实际的代码块名 */
const ASSIGNMENT_RE =
	/(?:^|[,;{(\s])([A-Za-z_$][\w$]*)\s*=\s*(["'`])([^"'`\r\n]{1,64})\2/g;

/**
 * 匹配 Obsidian 为代码块容器生成的类名。
 * 插件只要为自己的代码块写过样式，就会留下这条痕迹——零误报。
 */
const BLOCK_LANGUAGE_RE = /\.block-language-([A-Za-z0-9_-]{1,64})/g;

/** 每批并发读取的插件数量，避免移动端一次性打开过多文件 */
const BATCH_SIZE = 6;

export interface ParsedProcessors {
	/** 提取到的代码块名 */
	names: string[];
	/** 仍然无法解析的注册调用次数 */
	unparsedCount: number;
}

/** 收集源码里的字符串常量：变量名 → 它被赋过的所有字面量 */
function collectStringConstants(source: string): Map<string, string[]> {
	const table = new Map<string, string[]>();
	ASSIGNMENT_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = ASSIGNMENT_RE.exec(source)) !== null) {
		const name = match[1];
		const value = match[3];
		if (!name || !value) continue;

		const existing = table.get(name);
		if (existing) {
			if (!existing.includes(value)) existing.push(value);
		} else {
			table.set(name, [value]);
		}
	}
	return table;
}

/** 从 styles.css 里提取 `.block-language-xxx`，这些就是代码块名 */
export function parseBlockLanguageClasses(css: string): string[] {
	const names: string[] = [];
	const seen = new Set<string>();

	BLOCK_LANGUAGE_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = BLOCK_LANGUAGE_RE.exec(css)) !== null) {
		const name = match[1];
		if (!name || seen.has(name)) continue;
		seen.add(name);
		names.push(name);
	}
	return names;
}

/**
 * 从 main.js 源码里提取注册的代码块名。抽成纯函数便于单测——
 * 正则一旦写错，会把原本能扫到的插件一起弄丢。
 *
 * 参数是字面量时直接取；是变量时再回头查「变量名 = "字面量"」的赋值记录，
 * **只有唯一匹配才采用**——同名被赋过多个值就无从判断，宁可维持「未识别」，
 * 也不要把猜错的名字塞进候选列表。
 */
export function parseRegisteredNames(source: string): ParsedProcessors {
	const names: string[] = [];
	const seen = new Set<string>();
	const unresolved: string[] = [];
	let unparsedCount = 0;

	/**
	 * 收录一个候选名字，返回 false 表示它是动态拼接出来的、不能用。
	 * 带插值的模板字符串（`prefix${x}`）运行时才算得出内容，两个来源都要拦。
	 */
	const accept = (value: string): boolean => {
		if (value.includes('${')) return false;
		if (seen.has(value)) return true;
		seen.add(value);
		names.push(value);
		return true;
	};

	PROCESSOR_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = PROCESSOR_RE.exec(source)) !== null) {
		const literal = match[2];
		if (literal) {
			if (!accept(literal)) unparsedCount++;
			continue;
		}
		// 第二个分支：参数是标识符，先记下来，稍后尝试还原成常量
		const variable = match[3];
		if (variable) {
			unresolved.push(variable);
			continue;
		}
		// 第三个分支：参数既不是字面量也不是标识符（对象字面量等），无法解析
		unparsedCount++;
	}

	if (unresolved.length > 0) {
		const constants = collectStringConstants(source);
		for (const variable of unresolved) {
			const values = constants.get(variable);
			const only = values && values.length === 1 ? values[0] : undefined;
			if (only && accept(only)) continue;
			unparsedCount++;
		}
	}

	return { names, unparsedCount };
}

/**
 * 读取 community-plugins.json 得到已启用的插件 id 列表。
 * 该文件属于仓库配置文件，使用公开的 DataAdapter 读取，不触碰内部 API。
 * 读取失败时返回 null，调用方按「全部视为已启用」处理。
 */
async function readEnabledPluginIds(app: App): Promise<Set<string> | null> {
	try {
		const path = normalizePath(`${app.vault.configDir}/community-plugins.json`);
		const raw = await app.vault.adapter.read(path);
		const parsed: unknown = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			return new Set(parsed.filter((item): item is string => typeof item === 'string'));
		}
	} catch {
		// 文件不存在或不是合法 JSON：忽略
	}
	return null;
}

interface PluginScan {
	pluginId: string;
	pluginName: string;
	processors: ScannedProcessor[];
	/** 该插件里检出的变量式注册次数 */
	unparsedCount: number;
}

async function scanOnePlugin(
	adapter: DataAdapter,
	folder: string,
	enabledIds: Set<string> | null,
): Promise<PluginScan> {
	const pluginId = folder.split('/').pop() ?? folder;

	let pluginName = pluginId;
	try {
		const manifestRaw = await adapter.read(normalizePath(`${folder}/manifest.json`));
		const manifest: unknown = JSON.parse(manifestRaw);
		if (manifest && typeof manifest === 'object') {
			const name = (manifest as { name?: unknown }).name;
			if (typeof name === 'string' && name.length > 0) pluginName = name;
		}
	} catch {
		// manifest 缺失时退回目录名
	}

	let source: string;
	try {
		source = await adapter.read(normalizePath(`${folder}/main.js`));
	} catch {
		// 没有 main.js（可能是主题或未安装完成的目录）
		return { pluginId, pluginName, processors: [], unparsedCount: 0 };
	}

	const enabled = enabledIds ? enabledIds.has(pluginId) : true;
	const parsed = parseRegisteredNames(source);

	// 补充线索：插件为自己的代码块写过样式时，styles.css 里会留下 .block-language-xxx
	const values = new Set(parsed.names);
	try {
		const css = await adapter.read(normalizePath(`${folder}/styles.css`));
		for (const name of parseBlockLanguageClasses(css)) values.add(name);
	} catch {
		// 没有 styles.css 就跳过这条线索
	}

	const processors = [...values].map((value) => ({ value, pluginId, pluginName, enabled }));
	return { pluginId, pluginName, processors, unparsedCount: parsed.unparsedCount };
}

/** 同名处理器被多个插件注册时保留第一个，优先保留已启用的那个。 */
function dedupe(items: ScannedProcessor[]): ScannedProcessor[] {
	const map = new Map<string, ScannedProcessor>();
	for (const item of items) {
		const existing = map.get(item.value);
		if (!existing) {
			map.set(item.value, item);
			continue;
		}
		if (!existing.enabled && item.enabled) map.set(item.value, item);
	}
	return [...map.values()].sort((a, b) => a.value.localeCompare(b.value));
}

/**
 * 扫描仓库插件目录下所有插件的 main.js，提取注册过的代码块名称。
 * 全部使用公开 API（Vault.configDir / Vault.adapter），桌面端与移动端均可用。
 */
export async function scanInstalledPlugins(app: App): Promise<ScanResult> {
	const adapter = app.vault.adapter;
	const pluginsDir = normalizePath(`${app.vault.configDir}/plugins`);

	if (!(await adapter.exists(pluginsDir))) return { processors: [], unparsed: [] };

	const listing = await adapter.list(pluginsDir);
	const enabledIds = await readEnabledPluginIds(app);
	const folders = [...listing.folders].sort();

	const collected: ScannedProcessor[] = [];
	const unparsed: UnparsedPlugin[] = [];

	for (let index = 0; index < folders.length; index += BATCH_SIZE) {
		const batch = folders.slice(index, index + BATCH_SIZE);
		const settled = await Promise.all(batch.map((folder) => scanOnePlugin(adapter, folder, enabledIds)));
		for (const item of settled) {
			collected.push(...item.processors);
			if (item.unparsedCount > 0) {
				unparsed.push({
					pluginId: item.pluginId,
					pluginName: item.pluginName,
					count: item.unparsedCount,
				});
			}
		}
	}

	unparsed.sort((a, b) => a.pluginName.localeCompare(b.pluginName, 'en'));
	return { processors: dedupe(collected), unparsed };
}

// —— 插件随包附带的模板 ——

/** 某个插件通过 tips.json 分发的模板集合 */
export interface BundledSnippetSet {
	pluginId: string;
	pluginName: string;
	/** 该插件当前是否启用；用于在候选面板里标注「已禁用」 */
	enabled: boolean;
	table: SnippetTable;
}

async function readBundledFile(
	adapter: DataAdapter,
	folder: string,
	enabledIds: Set<string> | null,
): Promise<BundledSnippetSet | null> {
	const path = normalizePath(`${folder}/${BUNDLED_SNIPPET_FILE}`);
	try {
		if (!(await adapter.exists(path))) return null;

		const raw = await adapter.read(path);
		// tips.json 就是一张裸表：{ "标识符": [ { name, body } ] }
		const table: SnippetTable = normalizeSnippets(JSON.parse(raw));
		if (Object.keys(table).length === 0) return null;

		const pluginId = folder.split('/').pop() ?? folder;
		const enabled = enabledIds ? enabledIds.has(pluginId) : true;
		let pluginName = pluginId;
		try {
			const manifestRaw = await adapter.read(normalizePath(`${folder}/manifest.json`));
			const manifest: unknown = JSON.parse(manifestRaw);
			if (manifest && typeof manifest === 'object') {
				const name = (manifest as { name?: unknown }).name;
				if (typeof name === 'string' && name.length > 0) pluginName = name;
			}
		} catch {
			// manifest 读不到就退回目录名
		}

		return { pluginId, pluginName, enabled, table };
	} catch (error) {
		console.error(`[tips] 读取 ${path} 失败：`, error);
		return null;
	}
}

/**
 * 扫描各插件目录下随包附带的 tips.json。
 *
 * 这是给插件作者留的分发口子：作者把参考模板写进 tips.json 一起发布，
 * 用户装上插件就自动获得这些模板，无需手动导入。
 * 扫描结果只存在于内存，**不会写入用户自己的模板表**。
 */
export async function scanBundledSnippets(app: App): Promise<BundledSnippetSet[]> {
	const adapter = app.vault.adapter;
	const pluginsDir = normalizePath(`${app.vault.configDir}/plugins`);
	if (!(await adapter.exists(pluginsDir))) return [];

	const enabledIds = await readEnabledPluginIds(app);
	const listing = await adapter.list(pluginsDir);
	const folders = [...listing.folders].sort();

	const results: BundledSnippetSet[] = [];
	for (let index = 0; index < folders.length; index += BATCH_SIZE) {
		const batch = folders.slice(index, index + BATCH_SIZE);
		const settled = await Promise.all(
			batch.map((folder) => readBundledFile(adapter, folder, enabledIds)),
		);
		for (const item of settled) {
			if (item) results.push(item);
		}
	}
	return results;
}
