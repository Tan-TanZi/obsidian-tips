import type { Lang } from './i18n';

/** 候选项的来源分类 */
export type CandidateKind = 'language' | 'plugin' | 'custom';

/** 候选面板里的一个条目 */
export interface Candidate {
	/** 写入代码块 info string 的标识符，例如 java、mermaid、mechanism */
	value: string;
	/** 来源分类 */
	kind: CandidateKind;
	/** 条目右侧的备注（已按当前界面语言本地化） */
	note: string;
	/** 来源插件 id（仅 kind === 'plugin'） */
	pluginId?: string;
	/** 来源插件显示名（仅 kind === 'plugin'） */
	pluginName?: string;
	/** 来源插件是否处于启用状态（仅 kind === 'plugin'） */
	pluginEnabled?: boolean;
}

/** 设置页中用户自定义的条目 */
export interface CustomEntry {
	value: string;
	note: string;
}

/** 某个代码块标识符下的一条内容模板 */
export interface Snippet {
	/** 条目名，显示在面板左栏 */
	name: string;
	/** 条目内容，会整段写入代码块 */
	body: string;
}

/** 内容模板表：代码块标识符 → 条目列表 */
export type SnippetTable = Record<string, Snippet[]>;

/** 设置页里用于分组的条目清单 */
export interface IdentifierGroup {
	/** 分组标题（插件名 / 内置 / 自定义） */
	label: string;
	/** 该分组下的代码块条目 */
	identifiers: string[];
	/** 以弱化样式呈现（用于当前已不可用的分组） */
	muted?: boolean;
}

export interface TipsSettings {
	/** 界面语言：auto 跟随 Obsidian，其余强制指定 */
	language: 'auto' | Lang;
	/** 鼠标悬浮代码块时显示右下角按钮 */
	showHoverButton: boolean;
	/** 输入 ``` 后自动打开候选面板 */
	autoSuggestOnFence: boolean;
	/** 光标落在语言行上、或在该行增删字符时，也打开候选面板 */
	suggestInInfoLine: boolean;
	/** 候选按字母排序；关闭时语言保持内置的常用度顺序 */
	sortAlphabetically: boolean;
	/** 启动时扫描已安装插件注册的代码块名称 */
	scanPlugins: boolean;
	/** 是否读取插件随包附带的 tips.json */
	scanBundledSnippets: boolean;
	/** 是否包含内置语言列表 */
	includeBuiltinLanguages: boolean;
	/** 候选面板宽度（像素） */
	pickerWidth: number;
	/** 用户自定义条目 */
	customEntries: CustomEntry[];
	/** 内容模板：代码块标识符 → 条目列表 */
	snippets: SnippetTable;
}

export const PICKER_WIDTH_MIN = 280;
export const PICKER_WIDTH_MAX = 920;
export const PICKER_WIDTH_STEP = 20;

export const DEFAULT_SETTINGS: TipsSettings = {
	language: 'auto',
	showHoverButton: true,
	autoSuggestOnFence: true,
	suggestInInfoLine: true,
	sortAlphabetically: true,
	scanPlugins: true,
	scanBundledSnippets: true,
	includeBuiltinLanguages: true,
	pickerWidth: 580,
	customEntries: [],
	snippets: {},
};

/** 候选面板的两栏数据 */
export interface CandidateColumns {
	languages: Candidate[];
	plugins: Candidate[];
}
