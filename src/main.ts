import { getLanguage, MarkdownView, Notice, Plugin, type Editor } from 'obsidian';
import type { EditorView } from '@codemirror/view';

import { mergeSettings } from './core/preferences';
import {
	scanBundledSnippets,
	scanInstalledPlugins,
	type BundledSnippetSet,
	type ScannedProcessor,
	type UnparsedPlugin,
} from './core/scanner';
import {
	mergeBundledSnippets,
	normalizeSnippets,
	snippetKey,
	totalSnippets,
} from './core/snippets';
import { buildCandidates, filterColumn } from './core/store';
import { OBSIDIAN_PROCESSORS } from './data/languages';
import { codeblockTipsExtension, openPickerAtCursor, refreshCodeblockTips } from './editor/extension';
import { createTranslator, resolveLanguage, type Lang, type Translate } from './i18n';
import { TipsSettingTab } from './settings';
import {
	DEFAULT_SETTINGS,
	type CandidateColumns,
	type IdentifierGroup,
	type Snippet,
	type SnippetTable,
	type TipsSettings,
} from './types';

/**
 * 从 Obsidian 的 Editor 包装对象上取出底层 CodeMirror 6 视图。
 * editor 在某些视图状态下可能不存在，这里必须容错，否则会中断调用方。
 */
function getEditorView(editor: Editor | null | undefined): EditorView | null {
	if (!editor) return null;
	try {
		return (editor as unknown as { cm?: EditorView }).cm ?? null;
	} catch {
		return null;
	}
}

export default class TipsPlugin extends Plugin {
	settings: TipsSettings = { ...DEFAULT_SETTINGS };
	lang: Lang = 'zh';
	t: Translate = createTranslator('zh');

	private scanned: ScannedProcessor[] = [];
	/** 使用了变量式注册、名字无法自动识别的插件 */
	private unparsed: UnparsedPlugin[] = [];
	/** 插件随包附带的模板，只在内存里，不写进用户设置 */
	private bundled: BundledSnippetSet[] = [];
	private cachedColumns: CandidateColumns | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.applyLanguage();

		this.registerEditorExtension(codeblockTipsExtension(this));
		this.addSettingTab(new TipsSettingTab(this.app, this));

		this.addCommand({
			id: 'open-codeblock-language-picker',
			name: this.t('command.open'),
			editorCallback: (editor) => {
				const view = getEditorView(editor);
				if (!view || !openPickerAtCursor(view)) {
					new Notice(this.t('notice.noCodeBlock'));
				}
			},
		});

		this.addCommand({
			id: 'rescan-codeblock-names',
			name: this.t('command.rescan'),
			callback: () => {
				void this.rescan();
			},
		});

		if (this.settings.scanPlugins) {
			// 首次启动后台扫描，不打扰用户
			void this.rescan(true);
		}
	}

	// —— 设置 ——

	async loadSettings(): Promise<void> {
		this.settings = mergeSettings(await this.loadData());
	}

	/** refreshEditors 为 false 时只落盘与刷新候选，不触碰编辑器（用于拖动滑块这类高频操作）。 */
	async saveSettings(refreshEditors = true): Promise<void> {
		try {
			await this.saveData(this.settings);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(this.t('notice.saveFailed', { message }));
			return;
		}
		this.applyLanguage();
		this.invalidateCandidates();
		if (refreshEditors) this.refreshAllEditors();
	}

	/** 依据设置解析当前界面语言并重建翻译函数。 */
	applyLanguage(): void {
		this.lang = resolveLanguage(this.settings.language, getLanguage());
		this.t = createTranslator(this.lang);
	}

	// —— 候选数据 ——

	/** 供候选面板调用：按过滤词返回两栏候选。 */
	getColumns(query: string): CandidateColumns {
		const base = this.getBaseColumns();
		return {
			languages: filterColumn(base.languages, query),
			plugins: filterColumn(base.plugins, query),
		};
	}

	/**
	 * 扫描统计，用于设置页的说明文字。
	 *
	 * 口径是「候选栏里由插件提供的名称」，也就是扫描结果与附带模板的**并集**：
	 * - `names`：去重后的代码块名称总数（扫描结果 ∪ 附带模板的标识符）；
	 * - `plugins`：提供这些名称的插件数。只靠 tips.json 提供名字的插件也算——
	 *   例如 LMath 用变量式注册，main.js 里一个名字都扫不出来，但它的名字确实
	 *   出现在候选栏里，所以应当计入；
	 * - `bundledPlugins`：**带有 tips.json 的插件数**，也就是「有几个插件用了
	 *   tips.json」。
	 *
	 * 注意别把同族的三个量搞混（以「LMath 只有 tips.json、Excalidraw 只有扫描结果、
	 * Foo 两者都有且部分重叠」为例）：
	 *
	 * | 量                  | 含义                                   | 例值 |
	 * | ------------------- | -------------------------------------- | ---- |
	 * | bundledPlugins      | 带了 tips.json 文件的插件数（文件层面）  | 2    |
	 * | bundledOnlyNames    | 扫不到、只能靠 tips.json 的名称数        | 7    |
	 * | bundledOnlyPlugins  | 一个名字都扫不到、完全靠 tips.json 的插件数 | 1  |
	 *
	 * 本方法返回的是第一个。第二个是名称粒度，与插件数不是一个维度；
	 * 第三个才真正体现 tips.json 的「补救价值」（没有它就彻底用不了的插件有几个），
	 * 目前设置页没有展示，需要时在这里补算即可。
	 */
	getScanStats(): { names: number; plugins: number; bundledPlugins: number } {
		const names = new Set<string>();
		const providers = new Set<string>();

		for (const item of this.scanned) {
			names.add(item.value);
			providers.add(item.pluginId);
		}

		for (const set of this.bundled) {
			providers.add(set.pluginId);
			for (const identifier of Object.keys(set.table)) names.add(identifier);
		}

		return {
			names: names.size,
			plugins: providers.size,
			bundledPlugins: this.bundled.length,
		};
	}

	invalidateCandidates(): void {
		this.cachedColumns = null;
	}

	// —— 内容模板 ——

	/**
	 * 某个代码块标识符下的全部模板：用户自己维护的在前，插件随包附带的在后，按内容去重。
	 * 面板用这个方法。
	 */
	getSnippets(identifier: string): Snippet[] {
		const result: Snippet[] = [];
		const seen = new Set<string>();
		const push = (list: Snippet[]): void => {
			for (const item of list) {
				const key = snippetKey(item);
				if (seen.has(key)) continue;
				seen.add(key);
				result.push(item);
			}
		};

		push(this.settings.snippets[identifier] ?? []);
		for (const set of this.bundled) {
			const list = set.table[identifier];
			if (list) push(list);
		}
		return result;
	}

	/** 仅用户自己维护的模板（设置页的增删改都基于它） */
	getOwnSnippets(identifier: string): Snippet[] {
		return this.settings.snippets[identifier] ?? [];
	}

	/** 覆盖某个标识符的内容模板；传空数组即移除该标识符 */
	async setSnippets(identifier: string, list: Snippet[]): Promise<void> {
		if (list.length === 0) {
			delete this.settings.snippets[identifier];
		} else {
			this.settings.snippets[identifier] = list;
		}
		// 模板不影响编辑器装饰，无需刷新所有视图
		await this.saveSettings(false);
	}

	/**
	 * 应用导入结果：替换模板表，并补建缺失的自定义标识符（备注留空）。
	 *
	 * 分享者可能用了自己的私有代码块标识符，接收方这边还没创建过，
	 * 不补建的话模板就没有落脚点。只有自定义组会走这一步，
	 * 插件组的未知标识符仍然由 mergeImport 直接跳过。
	 */
	async applyImportedSnippets(table: SnippetTable, createdIdentifiers: string[]): Promise<void> {
		this.settings.snippets = normalizeSnippets(table);

		if (createdIdentifiers.length > 0) {
			const existing = new Set(this.settings.customEntries.map((entry) => entry.value.trim()));
			for (const identifier of createdIdentifiers) {
				if (existing.has(identifier)) continue;
				this.settings.customEntries.push({ value: identifier, note: '' });
				existing.add(identifier);
			}
		}

		await this.saveSettings();
		this.invalidateCandidates();
	}

	getSnippetTotal(): number {
		return totalSnippets(this.settings.snippets);
	}

	/**
	 * 导出时用来划分模板归属的两类标识符。
	 * 插件注册的与 Obsidian 自带的必须分开——内置处理器混进「自定义」里会让人摸不着头脑。
	 */
	getExportGroups(): { plugins: ReadonlySet<string>; builtin: ReadonlySet<string> } {
		const plugins = new Set<string>();
		for (const item of this.scanned) plugins.add(item.value);

		const builtin = new Set<string>();
		for (const entry of OBSIDIAN_PROCESSORS) builtin.add(entry.value);

		return { plugins, builtin };
	}

	/** 当前所有已知标识符：内置处理器 + 插件扫描结果 + 自定义条目 */
	getKnownIdentifiers(): Set<string> {
		const known = new Set<string>();
		for (const entry of OBSIDIAN_PROCESSORS) known.add(entry.value);
		for (const item of this.scanned) known.add(item.value);
		for (const entry of this.settings.customEntries) {
			const value = entry.value.trim();
			if (value.length > 0) known.add(value);
		}
		// 插件随包附带的模板，其标识符同样算「已知」，否则导入时会被误跳过
		for (const set of this.bundled) {
			for (const identifier of Object.keys(set.table)) known.add(identifier);
		}
		return known;
	}

	/** 设置页用的分组清单 */
	getSnippetGroups(): IdentifierGroup[] {
		const groups: IdentifierGroup[] = [];

		// 1. 内置处理器
		const builtin = OBSIDIAN_PROCESSORS.map((entry) => entry.value);
		if (builtin.length > 0) {
			groups.push({ label: this.t('setting.snippets.builtin'), identifiers: builtin });
		}

		// 2. 自定义条目：固定显示。即使一条都没有也要出现，
		//    用户才知道可以去哪里补模板（空组会显示一段引导文字）。
		const custom: string[] = [];
		for (const entry of this.settings.customEntries) {
			const value = entry.value.trim();
			if (value.length > 0) custom.push(value);
		}
		groups.push({ label: this.t('setting.snippets.customGroup'), identifiers: custom });

		// 3. 插件：按插件归组，组内与组间都按字母序。
		//    除了扫描到的代码块，也要带上该插件 tips.json 里的标识符——
		//    有些插件用变量注册，名字扫不出来，只能靠这份文件补上。
		const byPlugin = new Map<string, { name: string; values: Set<string> }>();
		const pluginGroup = (pluginId: string, pluginName: string): { name: string; values: Set<string> } => {
			let group = byPlugin.get(pluginId);
			if (!group) {
				group = { name: pluginName, values: new Set<string>() };
				byPlugin.set(pluginId, group);
			}
			return group;
		};

		for (const item of this.scanned) {
			pluginGroup(item.pluginId, item.pluginName).values.add(item.value);
		}
		for (const set of this.bundled) {
			const group = pluginGroup(set.pluginId, set.pluginName);
			for (const identifier of Object.keys(set.table)) group.values.add(identifier);
		}

		const pluginGroups = [...byPlugin.values()].sort((a, b) => a.name.localeCompare(b.name, 'en'));
		for (const group of pluginGroups) {
			groups.push({
				label: group.name,
				identifiers: [...group.values].sort((a, b) => a.localeCompare(b, 'en')),
			});
		}

		// 有模板但当前不可用的标识符（例如对应的插件已卸载）。
		// 单独归一组，既不会丢数据，也能让用户主动清理。
		const known = this.getKnownIdentifiers();
		const orphan = Object.keys(this.settings.snippets)
			.filter((identifier) => !known.has(identifier))
			.sort((a, b) => a.localeCompare(b, 'en'));
		if (orphan.length > 0) {
			// 这些条目的来源（插件或自定义）已经没了，用弱化样式呈现
			groups.push({ label: this.t('setting.snippets.orphan'), identifiers: orphan, muted: true });
		}

		return groups;
	}

	private getBaseColumns(): CandidateColumns {
		if (!this.cachedColumns) {
			this.cachedColumns = buildCandidates(
				this.settings,
				this.scanned,
				this.bundled,
				this.lang,
				this.t,
			);
		}
		return this.cachedColumns;
	}

	// —— 插件扫描 ——

	/** 重新扫描已安装插件注册的代码块名称。silent 为 true 时不弹出提示。 */
	async rescan(silent = false): Promise<void> {
		const wantProcessors = this.settings.scanPlugins;
		const wantBundled = this.settings.scanBundledSnippets;

		if (!wantProcessors && !wantBundled) {
			this.scanned = [];
			this.unparsed = [];
			this.bundled = [];
			this.invalidateCandidates();
			return;
		}

		if (!silent) new Notice(this.t('notice.scanning'));
		try {
			if (wantProcessors) {
				const result = await scanInstalledPlugins(this.app);
				this.scanned = result.processors;
				this.unparsed = result.unparsed;
			} else {
				this.scanned = [];
				this.unparsed = [];
			}
			this.bundled = wantBundled ? await scanBundledSnippets(this.app) : [];

			// 插件自带的模板并入本地模板表：同名更新、新的追加、本地独有的保留
			const merged = mergeBundledSnippets(
				this.settings.snippets,
				this.bundled.map((set) => set.table),
			);
			if (merged.changed) {
				this.settings.snippets = merged.table;
				await this.saveData(this.settings);
			}

			this.invalidateCandidates();
			if (!silent) {
				const stats = this.getScanStats();
				new Notice(
					this.t('notice.scanDone', {
						plugins: stats.plugins,
						count: stats.names,
					}),
				);
				const bundled = this.getBundledSummary();
				if (bundled.plugins > 0) {
					new Notice(
						this.t('notice.scanDoneBundled', {
							plugins: bundled.plugins,
							templates: bundled.templates,
						}),
					);
					if (merged.changed) {
						new Notice(this.t('notice.bundledMerged', { count: merged.added }));
					}
				}
			}
		} catch (error) {
			this.scanned = [];
			this.unparsed = [];
			this.bundled = [];
			this.invalidateCandidates();
			if (!silent) {
				const message = error instanceof Error ? error.message : String(error);
				new Notice(this.t('notice.scanFailed', { message }));
			}
		}
	}

	/** 存在变量式注册、需要手动补充条目的插件 */
	getUnparsedPlugins(): UnparsedPlugin[] {
		return this.unparsed;
	}

	/**
	 * 把插件附带的模板并入用户自己的模板表。
	 *
	 * 规则（按「插件自带优先」）：
	 * - tips.json 里有、本地没有的 → 追加；
	 * - 同标识符下**同名**的 → 用 tips.json 的内容覆盖（作者改了内容就跟着更新）；
	 * - 本地有、tips.json 里没有的 → 原样保留。作者迭代时删掉的旧条目因此不会被抹掉，
	 *   它会继续留在本地；等这个插件卸载后，就会落到「其他条目」分组里。
	 *
	 * 只改本地的 data.json，绝不写回插件目录。
	 */


	/** 附带模板的插件数量，以及其中的模板总条数（用于设置页与重扫提示） */
	getBundledSummary(): { plugins: number; templates: number } {
		let templates = 0;
		for (const set of this.bundled) {
			for (const list of Object.values(set.table)) templates += list.length;
		}
		return { plugins: this.bundled.length, templates };
	}

	/** 提供附带模板的插件名，按字母序（设置页提示块里逐个列出） */
	getBundledPluginNames(): string[] {
		return this.bundled
			.map((set) => set.pluginName)
			.sort((a, b) => a.localeCompare(b, 'en'));
	}

	// —— 编辑器刷新 ——

	/**
	 * 设置变更后让所有已打开的编辑器重新计算代码块装饰。
	 * 任何单个视图出错都不能影响其它视图，也不能让设置保存流程失败。
	 */
	private refreshAllEditors(): void {
		try {
			this.app.workspace.iterateAllLeaves((leaf) => {
				try {
					const markdownView = leaf.view;
					if (!(markdownView instanceof MarkdownView)) return;
					const view = getEditorView(markdownView.editor);
					if (view) refreshCodeblockTips(view);
				} catch {
					// 单个 leaf 失败时跳过，装饰会在下次编辑时自动重建
				}
			});
		} catch {
			// 遍历整体失败时忽略
		}
	}
}
