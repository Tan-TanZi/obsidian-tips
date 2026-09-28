import type { Translate } from '../i18n';
import type { Candidate, CandidateColumns } from '../types';
import { placePicker, scrollItemIntoView, type PickerAnchor } from './position';

export interface LangPickerOptions {
	/** 根据当前输入返回两栏候选 */
	getColumns: (query: string) => CandidateColumns;
	/** 用户确认某个候选 */
	onPick: (candidate: Candidate) => void;
	/** 面板被销毁 */
	onClose: () => void;
	/** 面板宽度（像素） */
	width: number;
	t: Translate;
}

interface ColumnParts {
	colEl: HTMLElement;
	listEl: HTMLElement;
	emptyEl: HTMLElement;
}

/**
 * 双栏候选面板：左栏为语言，右栏为插件与自定义条目。
 * 不使用第三方面板组件，直接在 body 上挂一个 fixed 定位的浮层，避免依赖内部 API。
 */
export class LangPicker {
	private readonly options: LangPickerOptions;
	private readonly el: HTMLElement;
	private readonly columns: [ColumnParts, ColumnParts];
	private items: Candidate[][] = [[], []];
	private activeCol: 0 | 1 = 0;
	private activeIndex: number[] = [0, 0];
	private query = '';
	private disposed = false;

	constructor(options: LangPickerOptions) {
		this.options = options;

		const el = document.createElement('div');
		el.className = 'tips-picker';
		el.setAttribute('role', 'listbox');
		// 交给浏览器按内容判断书写方向，阿拉伯语等 RTL 语言才能正常排版
		el.setAttribute('dir', 'auto');
		// 宽度来自设置，通过 CSS 变量交给样式表，方便用户再用 CSS 片段覆盖
		el.style.setProperty('--tips-picker-width', `${Math.round(options.width)}px`);

		const columnsEl = document.createElement('div');
		columnsEl.className = 'tips-picker-columns';

		const titles: [string, string] = [options.t('panel.languages'), options.t('panel.plugins')];
		const emptyTexts: [string, string] = [options.t('panel.empty.languages'), options.t('panel.empty.plugins')];

		const left = this.buildColumn(titles[0], emptyTexts[0]);
		const right = this.buildColumn(titles[1], emptyTexts[1]);
		columnsEl.append(left.colEl, right.colEl);

		const hintEl = document.createElement('div');
		hintEl.className = 'tips-picker-hint';
		hintEl.textContent = options.t('panel.hint');

		el.append(columnsEl, hintEl);

		// 面板内部的点击不冒泡到 document，避免被「点击外部关闭」逻辑误伤。
		el.addEventListener('mousedown', (event) => {
			event.stopPropagation();
		});

		this.el = el;
		this.columns = [left, right];
	}

	private buildColumn(title: string, emptyText: string): ColumnParts {
		const colEl = document.createElement('div');
		colEl.className = 'tips-picker-col';

		const titleEl = document.createElement('div');
		titleEl.className = 'tips-picker-title';
		titleEl.textContent = title;

		const listEl = document.createElement('div');
		listEl.className = 'tips-picker-list';

		const emptyEl = document.createElement('div');
		emptyEl.className = 'tips-picker-empty';
		emptyEl.textContent = emptyText;
		emptyEl.hidden = true;

		listEl.append(emptyEl);
		colEl.append(titleEl, listEl);
		return { colEl, listEl, emptyEl };
	}

	/** 挂载到 body，先渲染再按视口修正位置。 */
	open(anchor: PickerAnchor): void {
		if (this.disposed) return;
		document.body.appendChild(this.el);
		this.refresh();
		this.place(anchor);
	}

	isOpen(): boolean {
		return !this.disposed && this.el.isConnected;
	}

	/** 重新定位到新的锚点（用户开始输入时把面板移到光标下方）。 */
	reposition(anchor: PickerAnchor): void {
		if (this.disposed) return;
		this.place(anchor);
	}

	/** 更新过滤词并重新渲染（保留当前高亮位置）。 */
	setQuery(query: string): void {
		if (this.disposed || this.query === query) return;
		this.query = query;
		this.refresh();
	}

	moveVertical(delta: number): void {
		const items = this.items[this.activeCol] ?? [];
		if (items.length === 0) {
			this.moveHorizontal(delta > 0 ? 1 : -1);
			return;
		}

		const next = (this.activeIndex[this.activeCol] ?? 0) + delta;
		if (next >= 0 && next < items.length) {
			this.setActiveIndex(this.activeCol, next);
			this.updateActiveClass();
			return;
		}

		// 走到本栏尽头时跳到另一栏
		const other: 0 | 1 = this.activeCol === 0 ? 1 : 0;
		const otherItems = this.items[other] ?? [];
		if (otherItems.length === 0) return;
		this.activeCol = other;
		this.setActiveIndex(other, delta > 0 ? 0 : otherItems.length - 1);
		this.updateActiveClass();
	}

	moveHorizontal(delta: number): void {
		const target: 0 | 1 = delta > 0 ? 1 : 0;
		if (target === this.activeCol) return;
		const targetItems = this.items[target] ?? [];
		if (targetItems.length === 0) return;
		this.activeCol = target;
		this.setActiveIndex(target, Math.min(this.activeIndex[target] ?? 0, targetItems.length - 1));
		this.updateActiveClass();
	}

	/** 确认当前高亮项；没有可选项时返回 false。 */
	confirm(): boolean {
		const items = this.items[this.activeCol] ?? [];
		const current = items[this.activeIndex[this.activeCol] ?? 0];
		if (current) {
			this.options.onPick(current);
			return true;
		}
		const other: 0 | 1 = this.activeCol === 0 ? 1 : 0;
		const fallback = (this.items[other] ?? [])[this.activeIndex[other] ?? 0];
		if (fallback) {
			this.options.onPick(fallback);
			return true;
		}
		return false;
	}

	destroy(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.el.remove();
		this.options.onClose();
	}

	private setActiveIndex(column: 0 | 1, value: number): void {
		if (column === 0) this.activeIndex[0] = value;
		else this.activeIndex[1] = value;
	}

	private refresh(): void {
		const columns = this.options.getColumns(this.query);
		this.items = [columns.languages, columns.plugins];

		for (let column = 0; column < 2; column++) {
			const limit = Math.max(0, (this.items[column]?.length ?? 0) - 1);
			const index = Math.min(this.activeIndex[column] ?? 0, limit);
			this.setActiveIndex(column === 0 ? 0 : 1, index);
		}

		const activeItems = this.items[this.activeCol] ?? [];
		if (activeItems.length === 0) {
			const other: 0 | 1 = this.activeCol === 0 ? 1 : 0;
			if ((this.items[other] ?? []).length > 0) this.activeCol = other;
		}
		this.render();
	}

	private render(): void {
		for (let column = 0; column < 2; column++) {
			const parts = column === 0 ? this.columns[0] : this.columns[1];
			const items = this.items[column] ?? [];

			for (const child of Array.from(parts.listEl.children)) {
				if (child !== parts.emptyEl) child.remove();
			}
			parts.emptyEl.hidden = items.length > 0;

			items.forEach((item, index) => {
				const itemEl = document.createElement('div');
				itemEl.className = 'tips-picker-item';
				// 原生 title 提示：备注可能被省略号截断，这里给出完整内容
				itemEl.title = item.note.length > 0 ? `${item.value} — ${item.note}` : item.value;
				if (item.kind === 'plugin' && item.pluginEnabled === false) {
					itemEl.classList.add('is-disabled');
				}

				const valueEl = document.createElement('span');
				valueEl.className = 'tips-picker-value';
				valueEl.textContent = item.value;

				const noteEl = document.createElement('span');
				noteEl.className = 'tips-picker-note';
				noteEl.textContent = item.note;

				itemEl.append(valueEl, noteEl);

				itemEl.addEventListener('mousedown', (event) => {
					event.preventDefault();
					event.stopPropagation();
					const target: 0 | 1 = column === 0 ? 0 : 1;
					this.activeCol = target;
					this.setActiveIndex(target, index);
					this.confirm();
				});
				itemEl.addEventListener('mouseenter', () => {
					const target: 0 | 1 = column === 0 ? 0 : 1;
					this.activeCol = target;
					this.setActiveIndex(target, index);
					this.updateActiveClass();
				});

				parts.listEl.append(itemEl);
			});
		}
		this.updateActiveClass();
	}

	private updateActiveClass(): void {
		for (let column = 0; column < 2; column++) {
			const parts = column === 0 ? this.columns[0] : this.columns[1];
			const itemEls = parts.listEl.querySelectorAll<HTMLElement>('.tips-picker-item');

			let activeEl: HTMLElement | null = null;
			for (let index = 0; index < itemEls.length; index++) {
				const itemEl = itemEls[index];
				if (!itemEl) continue;
				const isActive = column === this.activeCol && index === (this.activeIndex[column] ?? 0);
				itemEl.classList.toggle('is-active', isActive);
				if (isActive) activeEl = itemEl;
			}
			if (activeEl) scrollItemIntoView(parts.listEl, activeEl);
		}
	}

	private place(anchor: PickerAnchor): void {
		placePicker(this.el, anchor);
	}
}
