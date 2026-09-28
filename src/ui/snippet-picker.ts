import { filterSnippets } from '../core/snippets';
import type { Translate } from '../i18n';
import type { Snippet } from '../types';
import {
	placePicker,
	scrollItemIntoView,
	SNIPPET_ANCHOR_GAP,
	type PickerAnchor,
} from './position';

export interface SnippetPickerOptions {
	/** 取当前代码块的完整条目列表（过滤由面板内部完成） */
	getItems: () => Snippet[];
	/** 用户确认某条模板 */
	onPick: (snippet: Snippet) => void;
	/** 面板被销毁 */
	onClose: () => void;
	/** 面板宽度（像素） */
	width: number;
	t: Translate;
}

/**
 * 内容模板面板：左列条目名（3 份宽），右列当前高亮项的完整内容（7 份宽）。
 * 与语言候选面板共用定位与滚动辅助，但布局和键盘语义不同，因此单独实现。
 */
export class SnippetPicker {
	private readonly options: SnippetPickerOptions;
	private readonly el: HTMLElement;
	private readonly listEl: HTMLElement;
	private readonly emptyEl: HTMLElement;
	private readonly previewEl: HTMLElement;
	private items: Snippet[] = [];
	private activeIndex = 0;
	private query = '';
	private disposed = false;

	constructor(options: SnippetPickerOptions) {
		this.options = options;

		const el = createDiv();
		el.className = 'tips-picker tips-snippet-picker';
		el.setAttribute('role', 'listbox');
		// 交给浏览器按内容判断书写方向，阿拉伯语等 RTL 语言才能正常排版
		el.setAttribute('dir', 'auto');
		el.setCssProps({ '--tips-picker-width': `${Math.round(options.width)}px` });

		const body = createDiv();
		body.className = 'tips-snippet-body';

		// 左列：条目名
		const listCol = createDiv();
		listCol.className = 'tips-snippet-col';
		const listTitle = createDiv();
		listTitle.className = 'tips-picker-title';
		listTitle.textContent = options.t('picker.snippet.title');

		const listEl = createDiv();
		listEl.className = 'tips-snippet-list';
		const emptyEl = createDiv();
		emptyEl.className = 'tips-picker-empty';
		emptyEl.hidden = true;
		listEl.append(emptyEl);
		listCol.append(listTitle, listEl);

		// 右列：内容预览
		const previewCol = createDiv();
		previewCol.className = 'tips-snippet-col';
		const previewTitle = createDiv();
		previewTitle.className = 'tips-picker-title';
		previewTitle.textContent = options.t('picker.snippet.preview');
		const previewEl = createEl('pre');
		previewEl.className = 'tips-snippet-preview';
		previewCol.append(previewTitle, previewEl);

		body.append(listCol, previewCol);

		const hintEl = createDiv();
		hintEl.className = 'tips-picker-hint';
		hintEl.textContent = options.t('picker.snippet.hint');

		el.append(body, hintEl);

		// 面板内部的点击不冒泡到 document，避免被「点击外部关闭」逻辑误伤
		el.addEventListener('mousedown', (event) => {
			event.stopPropagation();
		});

		this.el = el;
		this.listEl = listEl;
		this.emptyEl = emptyEl;
		this.previewEl = previewEl;
	}

	open(anchor: PickerAnchor): void {
		if (this.disposed) return;
		document.body.appendChild(this.el);
		this.render();
		this.place(anchor);
	}

	isOpen(): boolean {
		return !this.disposed && this.el.isConnected;
	}

	reposition(anchor: PickerAnchor): void {
		if (this.disposed) return;
		this.place(anchor);
	}

	/** 更新过滤词（只匹配条目名，正文不参与） */
	setQuery(query: string): void {
		if (this.disposed || this.query === query) return;
		this.query = query;
		this.render();
	}

	/** 当前是否一个条目都没有（用于决定按 Enter 时要不要吞掉这次按键） */
	hasItems(): boolean {
		return this.items.length > 0;
	}

	moveVertical(delta: number): void {
		if (this.items.length === 0) return;
		const next = this.activeIndex + delta;
		if (next < 0 || next >= this.items.length) return;
		this.activeIndex = next;
		this.updateActive();
	}

	/** 与语言面板的键盘接口保持一致；模板面板只有一栏，横向移动不做任何事。 */
	moveHorizontal(_delta: number): void {
		// 单栏面板，无横向导航
	}

	confirm(): boolean {
		const current = this.items[this.activeIndex];
		if (!current) return false;
		this.options.onPick(current);
		return true;
	}

	destroy(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.el.remove();
		this.options.onClose();
	}

	private place(anchor: PickerAnchor): void {
		// 比语言面板多留一段间距，避免预览区顶到光标所在的那行文字
		placePicker(this.el, anchor, SNIPPET_ANCHOR_GAP);
	}

	private render(): void {
		const all = this.options.getItems();
		this.items = filterSnippets(all, this.query);
		this.activeIndex = this.items.length === 0 ? 0 : Math.min(this.activeIndex, this.items.length - 1);

		for (const child of Array.from(this.listEl.children)) {
			if (child !== this.emptyEl) child.remove();
		}
		this.emptyEl.hidden = this.items.length > 0;

		if (this.items.length === 0) {
			this.emptyEl.textContent =
				all.length > 0
					? this.options.t('picker.snippet.noMatch')
					: `${this.options.t('picker.snippet.empty')} ${this.options.t('picker.snippet.emptyHint')}`;
		}

		this.items.forEach((item, index) => {
			const itemEl = createDiv();
			itemEl.className = 'tips-snippet-item';
			itemEl.title = item.name;

			const nameEl = createSpan();
			nameEl.className = 'tips-snippet-name';
			nameEl.textContent = item.name;
			itemEl.append(nameEl);

			itemEl.addEventListener('mousedown', (event) => {
				event.preventDefault();
				event.stopPropagation();
				this.activeIndex = index;
				this.confirm();
			});
			itemEl.addEventListener('mouseenter', () => {
				this.activeIndex = index;
				this.updateActive();
			});

			this.listEl.append(itemEl);
		});

		this.updateActive();
	}

	private updateActive(): void {
		const itemEls = this.listEl.querySelectorAll<HTMLElement>('.tips-snippet-item');
		itemEls.forEach((itemEl, index) => {
			itemEl.classList.toggle('is-active', index === this.activeIndex);
		});

		const current = this.items[this.activeIndex];
		this.previewEl.textContent = current ? current.body : '';

		const activeEl = itemEls[this.activeIndex];
		if (activeEl) scrollItemIntoView(this.listEl, activeEl);
	}
}
