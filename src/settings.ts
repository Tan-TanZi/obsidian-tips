import { App, Notice, PluginSettingTab, Setting } from 'obsidian';


import { isValidIdentifier } from './core/store';
import { isLang, LANGUAGE_OPTIONS } from './i18n';
import type TipsPlugin from './main';
import {
	PICKER_WIDTH_MAX,
	PICKER_WIDTH_MIN,
	PICKER_WIDTH_STEP,
	type CustomEntry,
	type IdentifierGroup,
	type Snippet,
} from './types';
import { SnippetEditModal, SnippetTransferModal } from './ui/snippet-modals';

/** 找到最近的一个纵向滚动祖先，设置页真正滚动的往往是 containerEl 的上级 */
function findScrollParent(el: HTMLElement): HTMLElement | null {
	let node = el.parentElement;
	while (node) {
		const overflowY = window.getComputedStyle(node).overflowY;
		if (overflowY === 'auto' || overflowY === 'scroll') return node;
		node = node.parentElement;
	}
	return null;
}

export class TipsSettingTab extends PluginSettingTab {
	private plugin: TipsPlugin;

	/**
	 * 每个代码块条目对应的 DOM 片段。
	 * 增删改模板时只刷新这一小块，而不是整页重绘——整页重绘会让滚动位置归零，
	 * 用户保存完一条模板还得重新滚下来。
	 */
	private snippetLists = new Map<string, HTMLElement>();
	private snippetRows = new Map<string, Setting>();

	constructor(app: App, plugin: TipsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		const t = this.plugin.t;
		const settings = this.plugin.settings;

		// 真正的整页重绘只发生在切换语言、开关设置这类场景。
		// 这里仍记下滚动位置，渲染完还原，避免那些场景也跳回顶部。
		const scroller = findScrollParent(containerEl);
		const scrollTop = scroller?.scrollTop ?? 0;

		this.snippetLists.clear();
		this.snippetRows.clear();
		containerEl.empty();
		containerEl.addClass('tips-settings');
		// 交给浏览器按内容判断书写方向，阿拉伯语等 RTL 语言才能正常排版
		containerEl.setAttribute('dir', 'auto');

		// —— 界面语言 ——
		new Setting(containerEl)
			.setName(t('setting.language'))
			.setDesc(t('setting.language.desc'))
			.addDropdown((dropdown) => {
				dropdown.addOption('auto', t('setting.language.auto'));
				// 语言名一律用它自己的写法，不随界面语言变化
				for (const option of LANGUAGE_OPTIONS) {
					dropdown.addOption(option.value, option.label);
				}
				dropdown.setValue(settings.language).onChange(async (value) => {
					settings.language = isLang(value) ? value : 'auto';
					await this.plugin.saveSettings();
					this.display();
				});
			});

		// —— 悬浮按钮 ——
		new Setting(containerEl)
			.setName(t('setting.hoverButton'))
			.setDesc(t('setting.hoverButton.desc'))
			.addToggle((toggle) =>
				toggle.setValue(settings.showHoverButton).onChange(async (value) => {
					settings.showHoverButton = value;
					await this.plugin.saveSettings();
				}),
			);

		// —— 输入 ``` 自动打开 ——
		new Setting(containerEl)
			.setName(t('setting.autoSuggest'))
			.setDesc(t('setting.autoSuggest.desc'))
			.addToggle((toggle) =>
				toggle.setValue(settings.autoSuggestOnFence).onChange(async (value) => {
					settings.autoSuggestOnFence = value;
					await this.plugin.saveSettings();
				}),
			);

		// —— 在语言行编辑时打开 ——
		new Setting(containerEl)
			.setName(t('setting.suggestInInfoLine'))
			.setDesc(t('setting.suggestInInfoLine.desc'))
			.addToggle((toggle) =>
				toggle.setValue(settings.suggestInInfoLine).onChange(async (value) => {
					settings.suggestInInfoLine = value;
					await this.plugin.saveSettings();
				}),
			);

		// —— 候选面板宽度 ——
		new Setting(containerEl)
			.setName(t('setting.pickerWidth'))
			.setDesc(t('setting.pickerWidth.desc', { min: PICKER_WIDTH_MIN, max: PICKER_WIDTH_MAX }))
			.addSlider((slider) =>
				slider
					.setLimits(PICKER_WIDTH_MIN, PICKER_WIDTH_MAX, PICKER_WIDTH_STEP)
					.setValue(settings.pickerWidth)
					.onChange(async (value) => {
						settings.pickerWidth = value;
						// 拖动过程中高频触发，只落盘、不刷新编辑器
						await this.plugin.saveSettings(false);
					}),
			);

		// —— 候选排序 ——
		new Setting(containerEl)
			.setName(t('setting.sortAlphabetically'))
			.setDesc(t('setting.sortAlphabetically.desc'))
			.addToggle((toggle) =>
				toggle.setValue(settings.sortAlphabetically).onChange(async (value) => {
					settings.sortAlphabetically = value;
					await this.plugin.saveSettings();
				}),
			);

		// —— 内置语言列表 ——
		new Setting(containerEl)
			.setName(t('setting.includeBuiltin'))
			.setDesc(t('setting.includeBuiltin.desc'))
			.addToggle((toggle) =>
				toggle.setValue(settings.includeBuiltinLanguages).onChange(async (value) => {
					settings.includeBuiltinLanguages = value;
					await this.plugin.saveSettings();
				}),
			);

		// —— 扫描插件 ——
		new Setting(containerEl)
			.setName(t('setting.scanPlugins'))
			.setDesc(t('setting.scanPlugins.desc'))
			.addToggle((toggle) =>
				toggle.setValue(settings.scanPlugins).onChange(async (value) => {
					settings.scanPlugins = value;
					await this.plugin.saveSettings();
					// 无论开还是关都要重扫：关闭时也需要清空已缓存的结果
					await this.plugin.rescan();
					this.display();
				}),
			);

		// —— 读取插件随包附带的模板 ——
		new Setting(containerEl)
			.setName(t('setting.scanBundled'))
			.setDesc(t('setting.scanBundled.desc'))
			.addToggle((toggle) =>
				toggle.setValue(settings.scanBundledSnippets).onChange(async (value) => {
					settings.scanBundledSnippets = value;
					await this.plugin.saveSettings();
					await this.plugin.rescan();
					this.display();
				}),
			);

		new Setting(containerEl)
			.setName(t('setting.rescan'))
			.setDesc(
				t('setting.rescan.desc', {
					count: this.plugin.getScannedCount(),
					plugins: this.plugin.getScannedPluginCount(),
				}),
			)
			.addButton((button) =>
				button.setButtonText(t('setting.rescan')).setCta().onClick(async () => {
					await this.plugin.rescan();
					this.display();
				}),
			);

		// 有插件用变量注册时，明确告诉用户「不是漏扫，是识别不了」，并给出补法
		const unparsed = this.plugin.getUnparsedPlugins();
		if (unparsed.length > 0) {
			const names = unparsed.map((item) => item.pluginName).join('、');
			const hint = containerEl.createDiv({ cls: 'tips-warning' });
			hint.createDiv({ text: t('setting.unparsed', { count: unparsed.length }) });
			hint.createDiv({ text: t('setting.unparsed.desc', { list: names }) });
		}

		// 附带模板的读取结果。与上面的警告同构，只是左侧色条换成主题色——
		// 它陈述的是「读到了什么」，不是需要用户去处理的问题。
		const bundled = this.plugin.getBundledSummary();
		if (bundled.plugins > 0) {
			const hint = containerEl.createDiv({ cls: 'tips-warning is-info' });
			hint.createDiv({
				text: t('setting.bundled', {
					plugins: bundled.plugins,
					count: bundled.templates,
				}),
			});
			hint.createDiv({
				text: t('setting.bundled.desc', {
					list: this.plugin.getBundledPluginNames().join('、'),
				}),
			});
		}

		// —— 自定义条目 ——
		new Setting(containerEl).setName(t('setting.custom')).setHeading();
		const customSection = this.createSection(containerEl);
		customSection.createDiv({ cls: 'setting-item-description', text: t('setting.custom.desc') });

		const listEl = customSection.createDiv({ cls: 'tips-custom-list' });
		if (settings.customEntries.length === 0) {
			listEl.createDiv({ cls: 'tips-custom-empty', text: t('setting.custom.empty') });
		}
		settings.customEntries.forEach((entry, index) => {
			this.renderCustomRow(listEl, entry, index);
		});

		customSection
			.createEl('button', { cls: 'mod-cta tips-custom-add', text: t('setting.custom.add') })
			.addEventListener('click', () => {
				void this.addEntry();
			});

		customSection.createDiv({ cls: 'tips-warning', text: t('setting.custom.restartHint') });

		// —— 内容模板 ——
		new Setting(containerEl).setName(t('setting.snippets')).setHeading();
		const snippetSection = this.createSection(containerEl);

		// 描述里的问号单独渲染，便于用主题色加粗强调
		const descEl = snippetSection.createDiv({ cls: 'setting-item-description' });
		descEl.appendText(t('setting.snippets.desc.before'));
		descEl.createEl('code', { cls: 'tips-key', text: '?' });
		descEl.appendText(t('setting.snippets.desc.after'));

		// 导入 / 导出独立成行，按钮用主题色，视觉上更醒目
		snippetSection
			.createDiv({ cls: 'tips-transfer-row' })
			.createEl('button', { cls: 'mod-cta tips-transfer-button', text: t('setting.snippets.transfer') })
			.addEventListener('click', () => {
				this.openTransfer();
			});
		snippetSection.createDiv({
			cls: 'tips-transfer-count',
			text: t('setting.snippets.count', { count: this.plugin.getSnippetTotal() }),
		});

		for (const group of this.plugin.getSnippetGroups()) {
			this.renderSnippetGroup(snippetSection, group);
		}

		if (scroller) {
			// 再补一次：刚插入的内容可能还没完成布局，同步赋值不总是生效
			scroller.scrollTop = scrollTop;
			window.requestAnimationFrame(() => {
				scroller.scrollTop = scrollTop;
			});
		}
	}

	/**
	 * 用标准 .setting-item 的外观包住一整块内容。
	 * 返回的容器是 .setting-item-info，后续内容按正常文档流垂直排列即可。
	 */
	private createSection(parent: HTMLElement): HTMLElement {
		const section = parent.createDiv({ cls: 'setting-item tips-section' });
		section.tabIndex = -1;
		return section.createDiv({ cls: 'setting-item-info' });
	}

	/**
	 * 分组标题：名字后面跟上该组可用的模板总数。
	 * 统计口径与模板面板一致（含插件随包附带的模板），
	 * 这样收起状态下也能一眼看出哪组有货。
	 */
	private groupLabel(group: IdentifierGroup): string {
		let count = 0;
		for (const identifier of group.identifiers) {
			count += this.plugin.getSnippets(identifier).length;
		}
		return `${group.label} (${count})`;
	}

	private renderSnippetGroup(parent: HTMLElement, group: IdentifierGroup): void {
		// 一律默认收起，设置页进来只看到分组名，点开 summary 才展开内容
		const details = parent.createEl('details', { cls: 'tips-snippet-group' });
		if (group.muted) details.addClass('is-muted');
		details.createEl('summary', { text: this.groupLabel(group) });

		if (group.identifiers.length === 0) {
			// 目前只有「自定义条目」这一组可能为空
			details.createDiv({
				cls: 'setting-item-description',
				text: this.plugin.t('setting.snippets.customEmpty'),
			});
			return;
		}

		for (const identifier of group.identifiers) {
			this.renderSnippetIdentifier(details, identifier);
		}
	}

	private renderSnippetIdentifier(parent: HTMLElement, identifier: string): void {
		const t = this.plugin.t;

		// 统一使用标准 Setting 组件，和设置页其它条目保持同一套外观。
		// 条数走 setDesc，按组件原生布局落在标识符名称下方。
		const row = new Setting(parent)
			.setName(identifier)
			.setDesc(t('setting.snippets.count', { count: this.plugin.getOwnSnippets(identifier).length }))
			.addButton((button) =>
				button.setButtonText(t('setting.snippets.add')).setCta().onClick(() => {
					this.addSnippet(identifier);
				}),
			);

		const listEl = parent.createDiv({ cls: 'tips-snippet-entries' });
		this.renderSnippetEntries(listEl, identifier, this.plugin.getOwnSnippets(identifier));

		this.snippetRows.set(identifier, row);
		this.snippetLists.set(identifier, listEl);
	}

	/** 只重画某个条目下的模板列表（含条数说明），不触碰设置页其余部分 */
	private renderSnippetEntries(
		listEl: HTMLElement,
		identifier: string,
		snippets: Snippet[],
	): void {
		const t = this.plugin.t;
		listEl.empty();

		if (snippets.length === 0) {
			listEl.createDiv({ cls: 'tips-custom-empty', text: t('setting.snippets.empty') });
			return;
		}

		snippets.forEach((snippet, index) => {
			new Setting(listEl)
				.setName(snippet.name)
				.setDesc(snippet.body.split('\n')[0] ?? '')
				.addButton((button) =>
				button.setButtonText(t('setting.snippets.edit')).onClick(() => {
					this.editSnippet(identifier, index);
				}),
			).addButton((button) =>
				button
					.setButtonText(t('setting.snippets.remove'))
					.setWarning()
					.onClick(() => {
						void this.removeSnippet(identifier, index);
					}),
			);
		});
	}

	/** 模板变动后的局部刷新：更新列表本身，以及条目那一行的条数说明 */
	private refreshSnippets(identifier: string): void {
		const snippets = this.plugin.getOwnSnippets(identifier);

		const listEl = this.snippetLists.get(identifier);
		if (listEl) this.renderSnippetEntries(listEl, identifier, snippets);

		const row = this.snippetRows.get(identifier);
		if (row) {
			row.setDesc(this.plugin.t('setting.snippets.count', { count: snippets.length }));
		}
	}

	private addSnippet(identifier: string): void {
		const existing = this.plugin.getOwnSnippets(identifier);
		const taken = new Set(existing.map((item) => item.name));
		new SnippetEditModal(
			this.app,
			this.plugin.t,
			null,
			taken,
			(snippet) => {
				// 保存时重新取一次，避免弹窗打开期间列表已被改动
				const current = this.plugin.getOwnSnippets(identifier);
				void this.saveSnippet(identifier, [...current, snippet], snippet.name);
			},
			null,
		).open();
	}

	private editSnippet(identifier: string, index: number): void {
		const existing = this.plugin.getOwnSnippets(identifier);
		const current = existing[index];
		if (!current) return;

		// 编辑自己时，「自己」的名字不算占用
		const taken = new Set(existing.filter((_, i) => i !== index).map((item) => item.name));
		new SnippetEditModal(
			this.app,
			this.plugin.t,
			current,
			taken,
			(snippet) => {
				const next = [...this.plugin.getOwnSnippets(identifier)];
				if (index < next.length) next[index] = snippet;
				else next.push(snippet);
				void this.saveSnippet(identifier, next, snippet.name);
			},
			() => {
				void this.removeSnippet(identifier, index);
			},
		).open();
	}

	private async saveSnippet(
		identifier: string,
		list: Snippet[],
		savedName: string,
	): Promise<void> {
		await this.plugin.setSnippets(identifier, list);
		this.refreshSnippets(identifier);

		// 保存后给个反馈：条目多的时候，改动的部分可能在可视区之外
		new Notice(this.plugin.t('notice.snippetSaved', { name: savedName }));
	}

	private async removeSnippet(identifier: string, index: number): Promise<void> {
		const list = [...this.plugin.getOwnSnippets(identifier)];
		const removed = list[index];
		list.splice(index, 1);
		await this.plugin.setSnippets(identifier, list);
		this.refreshSnippets(identifier);
		if (removed) new Notice(this.plugin.t('notice.snippetRemoved', { name: removed.name }));
	}

	private openTransfer(): void {
		new SnippetTransferModal(
			this.app,
			this.plugin.t,
			() => this.plugin.settings.snippets,
			() => this.plugin.getKnownIdentifiers(),
			() => this.plugin.getExportGroups(),
			async (table, outcome) => {
				await this.plugin.applyImportedSnippets(table, outcome.createdCustomIdentifiers);
				this.display();
			},
		).open();
	}

	private renderCustomRow(parent: HTMLElement, entry: CustomEntry, index: number): void {
		const t = this.plugin.t;
		const rowEl = parent.createDiv({ cls: 'tips-custom-row' });

		const valueInput = rowEl.createEl('input', {
			cls: 'tips-custom-input',
			type: 'text',
			attr: { placeholder: t('setting.custom.value') },
		});
		valueInput.value = entry.value;
		valueInput.addEventListener('change', () => {
			void this.updateEntry(index, { value: valueInput.value.trim() });
		});

		const noteInput = rowEl.createEl('input', {
			cls: 'tips-custom-input',
			type: 'text',
			attr: { placeholder: t('setting.custom.note') },
		});
		noteInput.value = entry.note;
		noteInput.addEventListener('change', () => {
			void this.updateEntry(index, { note: noteInput.value });
		});

		const removeButton = rowEl.createEl('button', {
			cls: 'tips-custom-remove',
			text: t('setting.custom.remove'),
		});
		removeButton.addEventListener('click', () => {
			void this.removeEntry(index);
		});
	}

	private async updateEntry(index: number, patch: Partial<CustomEntry>): Promise<void> {
		const t = this.plugin.t;
		const entries = this.plugin.settings.customEntries;
		const entry = entries[index];
		if (!entry) return;

		if (patch.value !== undefined) {
			if (!isValidIdentifier(patch.value)) {
				new Notice(t('setting.custom.invalid'));
				this.display();
				return;
			}
			const duplicated = entries.some(
				(other, otherIndex) => otherIndex !== index && other.value === patch.value,
			);
			if (duplicated) {
				new Notice(t('setting.custom.duplicate'));
				this.display();
				return;
			}
			entry.value = patch.value;
		}
		// 备注去掉首尾空白；留空时由候选项自行回退显示标识符
		if (patch.note !== undefined) entry.note = patch.note.trim();

		await this.plugin.saveSettings();
	}

	private async addEntry(): Promise<void> {
		this.plugin.settings.customEntries.push({ value: '', note: '' });
		try {
			await this.plugin.saveSettings();
		} catch {
			// saveSettings 内部已提示错误，这里只保证设置页继续刷新
		}
		this.display();

		const inputs = this.containerEl.querySelectorAll<HTMLInputElement>(
			'.tips-custom-row .tips-custom-input',
		);
		const last = inputs[inputs.length - 1];
		last?.focus();
	}

	private async removeEntry(index: number): Promise<void> {
		this.plugin.settings.customEntries.splice(index, 1);
		await this.plugin.saveSettings();
		this.display();
	}
}
