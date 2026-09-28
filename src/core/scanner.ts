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

/**
 * 匹配 registerMarkdownCodeBlockProcessor('xxx', ...) 以及旧的 registerCodeBlockProcessor。
 * 只认字面量参数；用变量拼接注册名的插件会被漏掉，可交给「自定义条目」兜底。
 */
const PROCESSOR_RE = /register(?:Markdown)?CodeBlockProcessor\s*\(\s*(['"`])([^'"`\s]{1,64})\1/g;

/** 每批并发读取的插件数量，避免移动端一次性打开过多文件 */
const BATCH_SIZE = 6;

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

async function scanOnePlugin(
	adapter: DataAdapter,
	folder: string,
	enabledIds: Set<string> | null,
): Promise<ScannedProcessor[]> {
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
		return [];
	}

	const enabled = enabledIds ? enabledIds.has(pluginId) : true;
	const found: ScannedProcessor[] = [];
	const seen = new Set<string>();

	PROCESSOR_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = PROCESSOR_RE.exec(source)) !== null) {
		const value = match[2];
		if (!value || seen.has(value)) continue;
		seen.add(value);
		found.push({ value, pluginId, pluginName, enabled });
	}
	return found;
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
export async function scanInstalledPlugins(app: App): Promise<ScannedProcessor[]> {
	const adapter = app.vault.adapter;
	const pluginsDir = normalizePath(`${app.vault.configDir}/plugins`);

	if (!(await adapter.exists(pluginsDir))) return [];

	const listing = await adapter.list(pluginsDir);
	const enabledIds = await readEnabledPluginIds(app);
	const folders = [...listing.folders].sort();

	const results: ScannedProcessor[] = [];
	for (let index = 0; index < folders.length; index += BATCH_SIZE) {
		const batch = folders.slice(index, index + BATCH_SIZE);
		const settled = await Promise.all(batch.map((folder) => scanOnePlugin(adapter, folder, enabledIds)));
		for (const list of settled) results.push(...list);
	}
	return dedupe(results);
}

// —— 插件随包附带的模板 ——

/** 某个插件通过 tips.json 分发的模板集合 */
export interface BundledSnippetSet {
	pluginId: string;
	pluginName: string;
	table: SnippetTable;
}

async function readBundledFile(adapter: DataAdapter, folder: string): Promise<BundledSnippetSet | null> {
	const path = normalizePath(`${folder}/${BUNDLED_SNIPPET_FILE}`);
	try {
		if (!(await adapter.exists(path))) return null;

		const raw = await adapter.read(path);
		// tips.json 就是一张裸表：{ "标识符": [ { name, body } ] }
		const table: SnippetTable = normalizeSnippets(JSON.parse(raw));
		if (Object.keys(table).length === 0) return null;

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
			// manifest 读不到就退回目录名
		}

		return { pluginId, pluginName, table };
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

	const listing = await adapter.list(pluginsDir);
	const folders = [...listing.folders].sort();

	const results: BundledSnippetSet[] = [];
	for (let index = 0; index < folders.length; index += BATCH_SIZE) {
		const batch = folders.slice(index, index + BATCH_SIZE);
		const settled = await Promise.all(batch.map((folder) => readBundledFile(adapter, folder)));
		for (const item of settled) {
			if (item) results.push(item);
		}
	}
	return results;
}
