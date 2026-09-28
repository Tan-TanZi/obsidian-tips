import { isLang } from '../i18n';
import {
	DEFAULT_SETTINGS,
	PICKER_WIDTH_MAX,
	PICKER_WIDTH_MIN,
	type CustomEntry,
	type TipsSettings,
} from '../types';
import { normalizeSnippets } from './snippets';

/** 清洗自定义条目：只保留结构合法的项，并复制成全新的对象。 */
export function normalizeCustomEntries(value: unknown): CustomEntry[] {
	if (!Array.isArray(value)) return [];
	const result: CustomEntry[] = [];
	for (const item of value) {
		if (!item || typeof item !== 'object') continue;
		const entry = item as Partial<CustomEntry>;
		result.push({
			value: typeof entry.value === 'string' ? entry.value : '',
			note: typeof entry.note === 'string' ? entry.note : '',
		});
	}
	return result;
}

/** 把面板宽度限制在允许范围内；非法值回退到默认宽度。 */
export function clampPickerWidth(value: unknown): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_SETTINGS.pickerWidth;
	return Math.min(PICKER_WIDTH_MAX, Math.max(PICKER_WIDTH_MIN, Math.round(value)));
}

function toBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

/**
 * 合并磁盘上的设置与默认值。
 *
 * 注意这里是浅合并里唯一需要特别处理的地方：customEntries 必须落到一个**新数组**上。
 * 若直接 `Object.assign({}, DEFAULT_SETTINGS, stored)`，在还没有 data.json 的情况下
 * `settings.customEntries` 会与模块级的 `DEFAULT_SETTINGS.customEntries` 共用同一个数组，
 * 首次「添加条目」时的 push 会污染默认值，造成插件状态异常。
 */
export function mergeSettings(stored: unknown): TipsSettings {
	const partial = (stored && typeof stored === 'object' ? stored : {}) as Partial<TipsSettings>;

	const merged: TipsSettings = { ...DEFAULT_SETTINGS, customEntries: [], ...partial };

	// 无论 partial 里有没有 customEntries，都重新生成一份独立数组
	merged.customEntries = normalizeCustomEntries(partial.customEntries);
	// snippets 同理：必须是全新对象，且顺带清洗掉非法与重复条目
	merged.snippets = normalizeSnippets(partial.snippets);
	merged.pickerWidth = clampPickerWidth(partial.pickerWidth);
	merged.language = isLang(partial.language) ? partial.language : 'auto';

	// 逐项校验布尔值，避免被手工改坏的 data.json 影响行为
	for (const key of [
		'showHoverButton',
		'autoSuggestOnFence',
		'suggestInInfoLine',
		'sortAlphabetically',
		'scanPlugins',
		'scanBundledSnippets',
		'includeBuiltinLanguages',
	] as const) {
		merged[key] = toBoolean(partial[key], DEFAULT_SETTINGS[key]);
	}
	return merged;
}
