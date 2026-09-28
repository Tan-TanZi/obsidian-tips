import { App, Modal, Notice, Setting } from 'obsidian';

import {
	BUNDLED_SNIPPET_FILE,
	mergeImport,
	stringifySnippets,
	stripFence,
	type ImportOutcome,
	type SnippetGroups,
} from '../core/snippets';
import type { Translate } from '../i18n';
import type { Snippet, SnippetTable } from '../types';

/** 新建 / 编辑一条内容模板 */
export class SnippetEditModal extends Modal {
	private readonly t: Translate;
	private readonly existing: Snippet | null;
	private readonly takenNames: ReadonlySet<string>;
	private readonly onSave: (snippet: Snippet) => void;
	private readonly onDelete: (() => void) | null;

	private name = '';
	private body = '';

	constructor(
		app: App,
		t: Translate,
		existing: Snippet | null,
		takenNames: ReadonlySet<string>,
		onSave: (snippet: Snippet) => void,
		onDelete: (() => void) | null,
	) {
		super(app);
		this.t = t;
		this.existing = existing;
		this.takenNames = takenNames;
		this.onSave = onSave;
		this.onDelete = onDelete;
		this.name = existing?.name ?? '';
		this.body = existing?.body ?? '';
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('tips-snippet-modal');
		contentEl.setAttribute('dir', 'auto');
		contentEl.createEl('h2', {
			text: this.existing ? this.t('modal.snippet.edit') : this.t('modal.snippet.new'),
		});

		new Setting(contentEl).setName(this.t('modal.snippet.name')).addText((text) => {
			text.setValue(this.name).onChange((value) => {
				this.name = value;
			});
			window.setTimeout(() => text.inputEl.focus(), 0);
		});

		contentEl.createEl('div', { cls: 'setting-item-name', text: this.t('modal.snippet.body') });
		contentEl.createEl('div', {
			cls: 'setting-item-description',
			text: this.t('modal.snippet.body.desc'),
		});

		const textarea = contentEl.createEl('textarea', { cls: 'tips-transfer-textarea' });
		textarea.rows = 12;
		textarea.value = this.body;
		textarea.addEventListener('input', () => {
			this.body = textarea.value;
		});

		const buttons = contentEl.createDiv({ cls: 'tips-modal-buttons' });
		const saveBtn = buttons.createEl('button', { cls: 'mod-cta', text: this.t('modal.snippet.save') });
		saveBtn.addEventListener('click', () => {
			this.submit();
		});
		buttons.createEl('button', { text: this.t('modal.snippet.cancel') }).addEventListener('click', () => {
			this.close();
		});
		if (this.onDelete) {
			buttons
				.createEl('button', { cls: 'mod-warning', text: this.t('modal.snippet.delete') })
				.addEventListener('click', () => {
					this.onDelete?.();
					this.close();
				});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private submit(): void {
		const name = this.name.trim();
		// 用户常直接粘贴整段代码块，这里统一剥掉外层围栏
		const body = stripFence(this.body);

		if (name.length === 0) {
			new Notice(this.t('modal.snippet.nameRequired'));
			return;
		}
		if (body.length === 0) {
			new Notice(this.t('modal.snippet.bodyRequired'));
			return;
		}
		// 同标识符下不允许同名，否则面板里会出现两条无法分辨的条目
		if (this.takenNames.has(name)) {
			new Notice(this.t('modal.snippet.duplicate'));
			return;
		}

		this.onSave({ name, body });
		this.close();
	}
}

/** 内容模板的导入 / 导出 */
export class SnippetTransferModal extends Modal {
	private readonly t: Translate;
	private readonly getTable: () => SnippetTable;
	private readonly getKnown: () => Set<string>;
	private readonly getSnippetGroups: () => SnippetGroups;
	private readonly applyImport: (table: SnippetTable, outcome: ImportOutcome) => Promise<void>;

	/** 是否一并导入非插件（自定义）那一组，默认收下 */
	private includeCustom = true;

	constructor(
		app: App,
		t: Translate,
		getTable: () => SnippetTable,
		getKnown: () => Set<string>,
		getSnippetGroups: () => SnippetGroups,
		applyImport: (table: SnippetTable, outcome: ImportOutcome) => Promise<void>,
	) {
		super(app);
		this.t = t;
		this.getTable = getTable;
		this.getKnown = getKnown;
		this.getSnippetGroups = getSnippetGroups;
		this.applyImport = applyImport;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('tips-transfer-modal');
		contentEl.setAttribute('dir', 'auto');
		contentEl.createEl('h2', { text: this.t('modal.transfer.title') });

		// —— 导出 ——
		contentEl.createEl('h3', { text: this.t('modal.transfer.export') });
		contentEl.createEl('div', {
			cls: 'setting-item-description',
			text: this.t('modal.transfer.export.desc'),
		});

		const exportArea = contentEl.createEl('textarea', { cls: 'tips-transfer-textarea' });
		exportArea.rows = 10;
		exportArea.readOnly = true;
		// 导出时按「插件 / 内置 / 自定义」分组，接收方才能区分对待
		exportArea.value = stringifySnippets(this.getTable(), this.getSnippetGroups());
		exportArea.addEventListener('focus', () => exportArea.select());

		const exportButtons = contentEl.createDiv({ cls: 'tips-modal-buttons' });
		exportButtons
			.createEl('button', { cls: 'mod-cta', text: this.t('modal.transfer.exportFile') })
			.addEventListener('click', () => {
				this.download(exportArea.value);
			});
		exportButtons
			.createEl('button', { cls: 'mod-cta', text: this.t('modal.transfer.copy') })
			.addEventListener('click', () => {
				void this.copy(exportArea);
			});

		// —— 导入 ——
		contentEl.createEl('h3', { text: this.t('modal.transfer.import') });
		contentEl.createEl('div', {
			cls: 'setting-item-description',
			text: this.t('modal.transfer.import.desc'),
		});

		// 导入前决定要不要连自定义模板一起收下
		new Setting(contentEl)
			.setName(this.t('modal.transfer.includeCustom'))
			.setDesc(this.t('modal.transfer.includeCustom.desc'))
			.addToggle((toggle) =>
				toggle.setValue(this.includeCustom).onChange((value) => {
					this.includeCustom = value;
				}),
			);

		const importArea = contentEl.createEl('textarea', { cls: 'tips-transfer-textarea' });
		importArea.rows = 10;
		importArea.setAttribute('placeholder', '{ "snippets": { "mechanism": [ ... ] } }');

		// 文件选择框本身隐藏，由按钮代为触发
		const fileInput = contentEl.createEl('input', { cls: 'tips-file-input', type: 'file' });
		fileInput.accept = '.json,application/json';
		fileInput.addEventListener('change', () => {
			void this.importFromFile(fileInput);
		});

		const importButtons = contentEl.createDiv({ cls: 'tips-modal-buttons' });
		importButtons
			.createEl('button', { cls: 'mod-cta', text: this.t('modal.transfer.importFile') })
			.addEventListener('click', () => {
				fileInput.click();
			});
		importButtons
			.createEl('button', { cls: 'mod-cta', text: this.t('modal.transfer.import.button') })
			.addEventListener('click', () => {
				void this.doImport(importArea.value);
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/** 导出为 tips.json 文件，方便直接分享或作为插件附带文件分发 */
	private download(content: string): void {
		try {
			const blob = new Blob([content], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = BUNDLED_SNIPPET_FILE;
			document.body.appendChild(link);
			link.click();
			link.remove();
			window.setTimeout(() => URL.revokeObjectURL(url), 1000);
			new Notice(this.t('modal.transfer.exported', { name: BUNDLED_SNIPPET_FILE }));
		} catch (error) {
			console.error('[tips] 导出文件失败：', error);
		}
	}

	private async importFromFile(input: HTMLInputElement): Promise<void> {
		const file = input.files?.[0];
		if (!file) return;
		try {
			await this.doImport(await file.text());
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(this.t('modal.transfer.invalid', { message }));
		} finally {
			// 清空以便重复选择同一个文件
			input.value = '';
		}
	}

	private async copy(textarea: HTMLTextAreaElement): Promise<void> {
		try {
			await navigator.clipboard.writeText(textarea.value);
			new Notice(this.t('modal.transfer.copied'));
		} catch {
			// 剪贴板不可用时退化为全选，让用户手动复制
			textarea.focus();
			textarea.select();
		}
	}

	private async doImport(raw: string): Promise<void> {
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(this.t('modal.transfer.invalid', { message }));
			return;
		}

		const outcome = mergeImport(parsed, this.getTable(), {
			known: this.getKnown(),
			includeCustom: this.includeCustom,
		});
		const nothing =
			outcome.added === 0 &&
			outcome.duplicates === 0 &&
			outcome.skippedIdentifiers.length === 0 &&
			outcome.skippedCustom === 0;
		if (nothing) {
			new Notice(this.t('modal.transfer.nothing'));
			return;
		}

		await this.applyImport(outcome.table, outcome);

		new Notice(
			this.t('modal.transfer.done', {
				added: outcome.added,
				duplicates: outcome.duplicates,
			}),
		);
		if (outcome.skippedIdentifiers.length > 0) {
			new Notice(
				this.t('modal.transfer.skipped', { list: outcome.skippedIdentifiers.join('、') }),
			);
		}
		if (outcome.skippedCustom > 0) {
			new Notice(this.t('modal.transfer.skippedCustom', { count: outcome.skippedCustom }));
		}
		if (outcome.createdCustomIdentifiers.length > 0) {
			new Notice(
				this.t('modal.transfer.createdCustom', {
					count: outcome.createdCustomIdentifiers.length,
				}),
			);
		}
		this.close();
	}
}
