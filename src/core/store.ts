import { BUILTIN_LANGUAGES } from '../data/languages';
import { text, type Lang, type Translate } from '../i18n';
import type { Candidate, CandidateColumns, TipsSettings } from '../types';
import type { ScannedProcessor } from './scanner';

/** 代码块标识符的合法性：非空，且不含空白、反引号、波浪号。 */
export function isValidIdentifier(value: string): boolean {
	return value.length > 0 && !/[\s`~]/.test(value);
}

/** 把设置、扫描结果和内置列表合并成两栏候选。 */
export function buildCandidates(
	settings: TipsSettings,
	scanned: ScannedProcessor[],
	lang: Lang,
	t: Translate,
): CandidateColumns {
	const languages: Candidate[] = [];
	const plugins: Candidate[] = [];

	if (settings.includeBuiltinLanguages) {
		for (const entry of BUILTIN_LANGUAGES) {
			languages.push({ value: entry.value, kind: 'language', note: text(entry.note, lang) });
		}
	}

	const seenCustom = new Set<string>();
	for (const entry of settings.customEntries) {
		const value = entry.value.trim();
		if (!isValidIdentifier(value) || seenCustom.has(value)) continue;
		seenCustom.add(value);
		// 备注留空或只填空格时，右侧回退显示标识符本身，避免出现空白候选项
		const note = entry.note.trim();
		plugins.push({
			value,
			kind: 'custom',
			note: note.length > 0 ? note : value,
		});
	}

	if (settings.scanPlugins) {
		const disabledSuffix = t('panel.note.disabled');
		for (const item of scanned) {
			const base = t('panel.note.plugin', { name: item.pluginName });
			plugins.push({
				value: item.value,
				kind: 'plugin',
				note: item.enabled ? base : `${base} (${disabledSuffix})`,
				pluginId: item.pluginId,
				pluginName: item.pluginName,
				pluginEnabled: item.enabled,
			});
		}
	}

	if (settings.sortAlphabetically) {
		languages.sort(compareByValue);
		plugins.sort(compareByValue);
	}

	return { languages, plugins };
}

/** 固定用 en 区域比较，避免结果随系统语言变化。 */
function compareByValue(a: Candidate, b: Candidate): number {
	return a.value.localeCompare(b.value, 'en');
}

/** 给单个条目打分；返回 -1 表示不匹配。分数越高越靠前。 */
export function matchScore(query: string, target: string): number {
	const q = query.toLowerCase();
	const value = target.toLowerCase();
	if (value === q) return 1000;
	if (value.startsWith(q)) return 800 - value.length;
	const index = value.indexOf(q);
	if (index >= 0) return 600 - index;
	if (isSubsequence(q, value)) return 300 - value.length;
	return -1;
}

/** query 的字符是否按顺序出现在 target 中（模糊匹配） */
function isSubsequence(query: string, target: string): boolean {
	let cursor = 0;
	for (let index = 0; index < target.length && cursor < query.length; index++) {
		if (target[index] === query[cursor]) cursor++;
	}
	return cursor === query.length;
}

/** 按 query 过滤并排序一栏候选；query 为空时原样返回。 */
export function filterColumn(items: Candidate[], query: string): Candidate[] {
	const trimmed = query.trim();
	if (trimmed.length === 0) return items;

	const ranked: Array<{ item: Candidate; rank: number }> = [];
	for (const item of items) {
		const rank = matchScore(trimmed, item.value);
		if (rank >= 0) ranked.push({ item, rank });
	}
	ranked.sort((a, b) => b.rank - a.rank);
	return ranked.map((entry) => entry.item);
}
