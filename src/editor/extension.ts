import {
	Decoration,
	EditorView,
	ViewPlugin,
	WidgetType,
	keymap,
	type DecorationSet,
	type ViewUpdate,
} from '@codemirror/view';
import { Prec, RangeSetBuilder, StateEffect, type Extension } from '@codemirror/state';
import { setIcon } from 'obsidian';

import type TipsPlugin from '../main';
import type { Candidate, Snippet } from '../types';
import { LangPicker } from '../ui/picker';
import type { PickerAnchor } from '../ui/position';
import { SnippetPicker } from '../ui/snippet-picker';
import {
	blockStartingAtLine,
	collectCodeBlocks,
	findSnippetTrigger,
	snippetReplacement,
	type CodeBlockInfo,
	type SnippetTrigger,
} from './codeblocks';

/** 每个编辑器视图对应一个控制器，keymap 借助它访问当前面板状态。 */
const controllers = new WeakMap<EditorView, CodeblockController>();

/** 两类面板对外的键盘接口一致，便于统一转发 */
type ActivePicker = LangPicker | SnippetPicker;

/**
 * 设置变更后用这个 effect 触发一次正规的装饰重建。
 * 直接在插件外部改写 instance.decorations 会绕过 CodeMirror 的更新流程，
 * 可能让视图状态与 DOM 不一致，因此统一走 dispatch。
 */
const refreshDecorationsEffect = StateEffect.define<null>();

/** 悬浮按钮：显示当前代码块语言，点击后打开双栏候选面板。 */
class CodeblockButtonWidget extends WidgetType {
	constructor(
		private readonly block: CodeBlockInfo,
		private readonly label: string,
		private readonly tooltip: string,
		private readonly onClick: (block: CodeBlockInfo, el: HTMLElement) => void,
	) {
		super();
	}

	eq(other: CodeblockButtonWidget): boolean {
		return (
			other.block.startLine === this.block.startLine &&
			other.block.endLine === this.block.endLine &&
			other.label === this.label &&
			other.tooltip === this.tooltip
		);
	}

	toDOM(): HTMLElement {
		const el = createSpan();
		el.className = 'tips-cb-btn';
		el.dataset.tipsBlock = String(this.block.startLine);
		el.setAttribute('aria-label', this.tooltip);
		el.setAttribute('title', this.tooltip);

		const iconEl = createSpan();
		iconEl.className = 'tips-cb-btn-icon';
		setIcon(iconEl, 'code-2');

		const labelEl = createSpan();
		labelEl.className = 'tips-cb-btn-label';
		labelEl.textContent = this.label;

		el.append(iconEl, labelEl);
		el.addEventListener('mousedown', (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.onClick(this.block, el);
		});
		return el;
	}

	/** 返回 false，让 widget 上的鼠标事件正常参与 CodeMirror 的事件处理。 */
	ignoreEvent(): boolean {
		return false;
	}
}

class CodeblockController {
	readonly view: EditorView;
	decorations: DecorationSet;

	private readonly plugin: TipsPlugin;
	private blocks: CodeBlockInfo[] = [];
	private picker: LangPicker | null = null;
	private pickerBlock: CodeBlockInfo | null = null;
	private snippetPicker: SnippetPicker | null = null;
	private snippetTrigger: SnippetTrigger | null = null;
	private hoverBlockStart: number | null = null;
	/**
	 * 抑制「由插件自身引发」的那一次变更再触发自动弹出。
	 * 典型场景：用户从面板选中候选，改写语言行本身就是一次语言行的文档变更，
	 * 若不抑制，面板会立刻被「在语言行编辑时打开候选」的规则重新弹回来。
	 */
	private suppressAutoOpen = false;

	private mouseRaf: number | null = null;
	private pendingMouse: { x: number; y: number } | null = null;
	private hoverApplyRaf: number | null = null;

	constructor(view: EditorView, plugin: TipsPlugin) {
		this.view = view;
		this.plugin = plugin;
		this.decorations = this.buildDecorations();
		controllers.set(view, this);

		view.dom.addEventListener('mousemove', this.onMouseMove);
		view.dom.addEventListener('mouseleave', this.onMouseLeave);
		document.addEventListener('mousedown', this.onDocumentMouseDown);
	}

	update(update: ViewUpdate): void {
		// 这里是整个插件最危险的位置：ViewPlugin.update 一旦把异常抛出去，
		// CodeMirror 的更新流程会中断，表现为编辑器与插件一起失灵、只能重启恢复。
		// 因此无论内部发生什么，都必须在此吞掉异常。
		try {
			let forced = false;
			for (const transaction of update.transactions) {
				for (const effect of transaction.effects) {
					if (effect.is(refreshDecorationsEffect)) forced = true;
				}
			}

			if (update.docChanged || update.viewportChanged || forced) {
				if (!this.plugin.settings.showHoverButton) {
					this.hoverBlockStart = null;
				}
				this.decorations = this.buildDecorations();
				// 按钮 DOM 会在本帧之后重建，下一帧再补一次可见性，避免悬停状态丢失
				this.applyHoverState();
				this.scheduleHoverApply();
			}
			// 编辑器滚动后，fixed 定位的面板会与代码块脱节，直接收起
			if (update.viewportChanged && !update.docChanged) {
				this.closeAllPickers();
			}

			if (update.docChanged) {
				this.syncAfterDocChange();
				this.syncSnippetPicker();
			} else if (update.selectionSet) {
				this.syncAfterSelectionChange();
				this.syncSnippetPicker();
			}
		} catch (error) {
			console.error('[tips] 编辑器更新出错，已跳过本次面板同步：', error);
			this.closePicker();
		}
	}

	destroy(): void {
		this.closeAllPickers();
		controllers.delete(this.view);

		this.view.dom.removeEventListener('mousemove', this.onMouseMove);
		this.view.dom.removeEventListener('mouseleave', this.onMouseLeave);
		document.removeEventListener('mousedown', this.onDocumentMouseDown);
		if (this.mouseRaf !== null) {
			window.cancelAnimationFrame(this.mouseRaf);
			this.mouseRaf = null;
		}
		if (this.hoverApplyRaf !== null) {
			window.cancelAnimationFrame(this.hoverApplyRaf);
			this.hoverApplyRaf = null;
		}
	}

	private scheduleHoverApply(): void {
		if (this.hoverApplyRaf !== null) return;
		this.hoverApplyRaf = window.requestAnimationFrame(() => {
			this.hoverApplyRaf = null;
			this.applyHoverState();
		});
	}

	// —— 供 keymap 调用 ——

	/** 当前活跃的面板：语言候选或内容模板，二者互斥 */
	private activePicker(): ActivePicker | null {
		return this.picker ?? this.snippetPicker;
	}

	keyVertical(delta: number): boolean {
		const active = this.activePicker();
		if (!active) return false;
		active.moveVertical(delta);
		return true;
	}

	keyHorizontal(delta: number): boolean {
		const active = this.activePicker();
		if (!active) return false;
		active.moveHorizontal(delta);
		return true;
	}

	keyConfirm(): boolean {
		const active = this.activePicker();
		if (!active) return false;
		try {
			return active.confirm();
		} catch (error) {
			console.error('[tips] 确认候选项失败：', error);
			this.closeAllPickers();
			return true;
		}
	}

	keyClose(): boolean {
		if (!this.activePicker()) return false;
		this.closeAllPickers();
		return true;
	}

	/** 命令面板入口：把光标所在代码块的候选面板打开。 */
	openAtCursor(): boolean {
		const pos = this.view.state.selection.main.head;
		const block = this.blockAtInfoPos(pos);
		if (!block) return false;
		this.openPickerFor(block, null);
		return true;
	}

	/**
	 * 光标所在行是否为某个代码块的起始行。
	 * 直接复用 buildDecorations 缓存下来的 blocks，避免重复扫描文档。
	 */
	private blockAtInfoPos(pos: number): CodeBlockInfo | null {
		const line = this.view.state.doc.lineAt(pos);
		return blockStartingAtLine(this.blocks, line.number);
	}



	// —— 装饰构建 ——

	private buildDecorations(): DecorationSet {
		const doc = this.view.state.doc;
		const builder = new RangeSetBuilder<Decoration>();
		const upToLine = doc.lineAt(this.view.viewport.to).number;

		this.blocks = collectCodeBlocks(doc, upToLine);
		if (!this.plugin.settings.showHoverButton) return builder.finish();

		const viewFrom = this.view.viewport.from;
		const viewTo = this.view.viewport.to;
		const tooltip = this.plugin.t('button.label');
		const placeholder = this.plugin.t('button.placeholder');

		for (const block of this.blocks) {
			const endLine = doc.line(block.endLine);
			if (endLine.to < viewFrom) continue;
			const startLine = doc.line(block.startLine);
			if (startLine.from > viewTo) break;

			builder.add(endLine.from, endLine.from, Decoration.line({ class: 'tips-cb-lastline' }));
			builder.add(
				endLine.to,
				endLine.to,
				Decoration.widget({
					widget: new CodeblockButtonWidget(
						block,
						block.info.length > 0 ? block.info : placeholder,
						tooltip,
						(target, el) => this.onButtonClick(target, el),
					),
					side: 1,
				}),
			);
		}
		return builder.finish();
	}

	// —— 悬浮按钮 ——

	private readonly onMouseMove = (event: MouseEvent): void => {
		this.pendingMouse = { x: event.clientX, y: event.clientY };
		if (this.mouseRaf !== null) return;
		this.mouseRaf = window.requestAnimationFrame(() => {
			this.mouseRaf = null;
			const pending = this.pendingMouse;
			if (pending) this.updateHover(pending.x, pending.y);
		});
	};

	private readonly onMouseLeave = (): void => {
		this.setHoverBlock(null);
	};

	private updateHover(x: number, y: number): void {
		if (!this.plugin.settings.showHoverButton) {
			this.setHoverBlock(null);
			return;
		}
		const pos = this.view.posAtCoords({ x, y });
		if (pos === null) {
			this.setHoverBlock(null);
			return;
		}
		const line = this.view.state.doc.lineAt(pos);
		let hit: number | null = null;
		for (const block of this.blocks) {
			if (line.number >= block.startLine && line.number <= block.endLine) {
				hit = block.startLine;
				break;
			}
		}
		this.setHoverBlock(hit);
	}

	private setHoverBlock(startLine: number | null): void {
		// 不做「值未变化就跳过」的短路：按钮可能刚被重建，需要重新套用可见性
		this.hoverBlockStart = startLine;
		this.applyHoverState();
	}

	private applyHoverState(): void {
		const buttons = this.view.dom.querySelectorAll<HTMLElement>('.tips-cb-btn');
		buttons.forEach((button) => {
			const match =
				this.hoverBlockStart !== null && button.dataset.tipsBlock === String(this.hoverBlockStart);
			button.classList.toggle('is-visible', match);
		});
	}

	private onButtonClick(block: CodeBlockInfo, el: HTMLElement): void {
		if (this.picker && this.pickerBlock?.startLine === block.startLine) {
			this.closePicker();
			return;
		}
		this.openPickerFor(block, el);
	}

	// —— 面板生命周期 ——

	/**
	 * 打开候选面板。
	 * query 为空表示展示全部候选（悬浮按钮 / 光标刚落到语言行）；
	 * 传入语言行现有内容则表示要据此过滤（正在编辑那一行）。
	 */
	private openPickerFor(block: CodeBlockInfo, anchorEl: HTMLElement | null, query = ''): void {
		// 打开面板的过程本身也会发生布局变化，期间不触发自动弹出
		this.suppressAutoOpen = true;
		try {
			this.closePicker();

			const doc = this.view.state.doc;
			const lineNumber = Math.min(block.startLine, doc.lines);
			const line = doc.line(lineNumber);
			const cursorTarget = Math.min(line.from + block.infoTo, line.to);

			// 刻意不移动光标：悬浮按钮只负责「选择语言」，不该改变用户的编辑位置，
			// 选好之后 applyCandidate 会直接改写 info string。
			const fresh = blockStartingAtLine(this.blocks, lineNumber) ?? block;

			const picker = new LangPicker({
				t: this.plugin.t,
				width: this.plugin.settings.pickerWidth,
				getColumns: (query) => this.plugin.getColumns(query),
				onPick: (candidate) => this.applyCandidate(candidate),
				onClose: () => {
					this.picker = null;
					this.pickerBlock = null;
				},
			});

			this.picker = picker;
			this.pickerBlock = fresh;

			if (query.length > 0) picker.setQuery(query);

			// 先用不依赖布局测量的位置显示出来，避免空白一帧
			picker.open(this.directAnchor(anchorEl));

			// 从输入触发时锚点应取光标坐标，必须在 CodeMirror 允许的测量期读取
			if (!anchorEl) this.measureAnchorToCursor(cursorTarget);
		} finally {
			this.suppressAutoOpen = false;
		}
	}

	private closePicker(): void {
		const picker = this.picker;
		this.picker = null;
		this.pickerBlock = null;
		if (!picker) return;
		try {
			picker.destroy();
		} catch (error) {
			console.error('[tips] 关闭候选面板失败：', error);
		}
	}

	private closeSnippetPicker(): void {
		const picker = this.snippetPicker;
		this.snippetPicker = null;
		this.snippetTrigger = null;
		if (!picker) return;
		try {
			picker.destroy();
		} catch (error) {
			console.error('[tips] 关闭内容模板面板失败：', error);
		}
	}

	private closeAllPickers(): void {
		this.closePicker();
		this.closeSnippetPicker();
	}

	/**
	 * 同步内容模板面板。
	 *
	 * 触发条件是代码块内容区的第一个字符为 `?`（见 findSnippetTrigger）。
	 * 模板面板与语言面板互斥，同一时间只会存在一个。
	 */
	private syncSnippetPicker(): void {
		const state = this.view.state;
		const selection = state.selection.main;

		const trigger = selection.empty
			? findSnippetTrigger(state.doc, selection.head, this.blocks)
			: null;

		if (!trigger) {
			this.closeSnippetPicker();
			return;
		}

		// 与语言候选面板互斥
		this.closePicker();
		this.snippetTrigger = trigger;

		const existing = this.snippetPicker;
		if (existing) {
			existing.setQuery(trigger.query);
			this.measureAnchorToCursor(selection.head);
			return;
		}

		const picker = new SnippetPicker({
			t: this.plugin.t,
			width: this.plugin.settings.pickerWidth,
			getItems: () => {
				const identifier = this.snippetTrigger?.block.info ?? '';
				return this.plugin.getSnippets(identifier);
			},
			onPick: (snippet) => this.applySnippet(snippet),
			onClose: () => {
				this.snippetPicker = null;
				this.snippetTrigger = null;
			},
		});
		this.snippetPicker = picker;

		this.suppressAutoOpen = true;
		try {
			picker.open(this.directAnchor(null));
		} finally {
			this.suppressAutoOpen = false;
		}
		this.measureAnchorToCursor(selection.head);
	}

	private applySnippet(snippet: Snippet): void {
		const trigger = this.snippetTrigger;
		this.closeSnippetPicker();
		if (!trigger) return;

		this.suppressAutoOpen = true;
		try {
			const replacement = snippetReplacement(trigger, snippet.body);
			this.view.dispatch({
				changes: { from: replacement.from, to: replacement.to, insert: replacement.insert },
				selection: { anchor: replacement.cursor },
			});
		} catch (error) {
			console.error('[tips] 插入内容模板失败：', error);
		} finally {
			this.suppressAutoOpen = false;
		}
	}

	/**
	 * 直接可用的锚点：按钮矩形取自普通 DOM，编辑器矩形只作退化兜底。
	 * 全程不调用 coordsAtPos，因此在 CodeMirror 的更新期内调用也是安全的。
	 */
	private directAnchor(anchorEl: HTMLElement | null): PickerAnchor {
		try {
			if (anchorEl) {
				const rect = anchorEl.getBoundingClientRect();
				return { left: rect.left, top: rect.top, bottom: rect.bottom };
			}
			const rect = this.view.dom.getBoundingClientRect();
			return { left: rect.left + 28, top: rect.top + 28, bottom: rect.top + 30 };
		} catch (error) {
			console.error('[tips] 计算候选面板初始位置失败：', error);
			return { left: 80, top: 80, bottom: 82 };
		}
	}

	/**
	 * 把面板修正到光标位置。
	 *
	 * coordsAtPos 会读取编辑器布局，而本方法经常在 ViewPlugin.update 期间被调用，
	 * 直接调用会抛 "Reading the editor layout isn't allowed during an update"，
	 * 因此统一走 requestMeasure，交给 CodeMirror 安排到安全的测量阶段执行。
	 */
	private measureAnchorToCursor(pos: number): void {
		try {
			this.view.requestMeasure<PickerAnchor | null>({
				read: (view) => {
					try {
						const coords = view.coordsAtPos(pos);
						if (!coords) return null;
						return { left: coords.left, top: coords.top, bottom: coords.bottom };
					} catch {
						return null;
					}
				},
				write: (anchor) => {
					if (!anchor) return;
					try {
						// 必须作用于「当前活跃」的面板：语言面板与内容模板面板是两套实例，
						// 只挪 this.picker 会让模板面板一直停在首次出现的位置。
						this.activePicker()?.reposition(anchor);
					} catch (error) {
						console.error('[tips] 重新定位面板失败：', error);
					}
				},
			});
		} catch (error) {
			console.error('[tips] 申请测量候选面板位置失败：', error);
		}
	}

	private applyCandidate(candidate: Candidate): void {
		const block = this.pickerBlock;
		// 先收起面板再写入，避免 dispatch 触发的更新重新进入面板同步逻辑
		this.closePicker();
		if (!block) return;

		this.suppressAutoOpen = true;
		try {
			const doc = this.view.state.doc;
			const lineNumber = Math.min(block.startLine, doc.lines);
			const line = doc.line(lineNumber);
			const from = line.from + Math.min(block.infoFrom, line.length);
			const to = line.from + Math.min(block.infoTo, line.length);
			const changes = { from, to, insert: candidate.value };

			// 只有在光标本来就位于语言区（输入触发）时才把光标带到新语言之后；
			// 若面板由悬浮按钮打开，光标在别处，就不要打扰用户当前的编辑位置。
			const head = this.view.state.selection.main.head;
			if (head >= from && head <= to) {
				this.view.dispatch({ changes, selection: { anchor: from + candidate.value.length } });
			} else {
				this.view.dispatch({ changes });
			}
		} catch (error) {
			console.error('[tips] 写入代码块语言失败：', error);
		} finally {
			this.suppressAutoOpen = false;
		}
	}

	private readonly onDocumentMouseDown = (event: MouseEvent): void => {
		// 点击编辑器内部时交给光标逻辑判断（点到语言行会重新弹出面板）；
		// 若这里无差别关闭，会把刚打开的面板立刻关掉。
		const target = event.target;
		if (target instanceof Node && this.view.dom.contains(target)) return;
		this.closeAllPickers();
	};

	// —— 打开时机 ——

	private syncAfterDocChange(): void {
		const state = this.view.state;
		const selection = state.selection.main;

		// 面板已打开：把 info string 当作过滤词持续同步
		if (this.picker) {
			this.syncPickerToCursor();
			return;
		}

		// 这一次变更由插件自己触发（例如刚应用候选），不再弹一次
		if (this.suppressAutoOpen) return;
		if (!selection.empty) return;
		const block = this.blockAtInfoPos(selection.head);
		if (!block) return;

		// 情况一：刚敲下三个反引号，语言还是空的
		if (/^ {0,3}`{3}$/.test(state.doc.lineAt(selection.head).text)) {
			if (this.plugin.settings.autoSuggestOnFence) this.openPickerFor(block, null, '');
			return;
		}

		// 情况二：正在语言行上增删字符（例如把 java 改成 python）
		if (this.plugin.settings.suggestInInfoLine) {
			this.openPickerFor(block, null, block.info);
		}
	}

	private syncAfterSelectionChange(): void {
		const state = this.view.state;
		const selection = state.selection.main;

		if (this.picker) {
			this.syncPickerToCursor();
			return;
		}

		if (this.suppressAutoOpen) return;
		if (!this.plugin.settings.suggestInInfoLine) return;
		if (!selection.empty) return;
		const block = this.blockAtInfoPos(selection.head);
		if (!block) return;
		// 光标落到语言行：直接用该行现有内容过滤，接着编辑就能看到结果
		this.openPickerFor(block, null, block.info);
	}

	/**
	 * 面板打开期间，光标必须停在某个代码块的语言行上。
	 * 一旦用户跑到别处编辑（例如点开按钮后直接在代码正文里打字），
	 * 面板就与当前的编辑行为脱节了，此时收起更符合直觉。
	 */
	private syncPickerToCursor(): void {
		const selection = this.view.state.selection.main;
		if (!selection.empty) {
			this.closePicker();
			return;
		}
		const block = this.blockAtInfoPos(selection.head);
		if (!block) {
			this.closePicker();
			return;
		}
		this.pickerBlock = block;
		this.picker?.setQuery(block.info);
		// 面板始终跟随光标：从悬浮按钮打开的面板会在这里移到正在编辑的那一行，
		// 否则它会一直停在按钮原来的位置上。
		if (this.picker) this.measureAnchorToCursor(selection.head);
	}
}

/** 面板打开时抢占方向键与确认键，其余情况一律放行。 */
const pickerKeymap = Prec.highest(
	keymap.of([
		{ key: 'ArrowDown', run: (view) => controllers.get(view)?.keyVertical(1) ?? false },
		{ key: 'ArrowUp', run: (view) => controllers.get(view)?.keyVertical(-1) ?? false },
		{ key: 'ArrowRight', run: (view) => controllers.get(view)?.keyHorizontal(1) ?? false },
		{ key: 'ArrowLeft', run: (view) => controllers.get(view)?.keyHorizontal(-1) ?? false },
		{ key: 'Enter', run: (view) => controllers.get(view)?.keyConfirm() ?? false },
		{ key: 'Tab', run: (view) => controllers.get(view)?.keyConfirm() ?? false },
		{ key: 'Escape', run: (view) => controllers.get(view)?.keyClose() ?? false },
	]),
);

/** 插件注册到编辑器上的全部扩展。 */
export function codeblockTipsExtension(plugin: TipsPlugin): Extension {
	return [
		ViewPlugin.define((view) => new CodeblockController(view, plugin), {
			decorations: (instance) => instance.decorations,
		}),
		pickerKeymap,
	];
}

/** 命令面板调用：在光标所在的代码块上打开候选面板。 */
export function openPickerAtCursor(view: EditorView): boolean {
	const controller = controllers.get(view);
	if (!controller) return false;
	return controller.openAtCursor();
}

/** 设置变更后调用：让某个编辑器视图重新计算代码块装饰。 */
export function refreshCodeblockTips(view: EditorView): void {
	view.dispatch({ effects: refreshDecorationsEffect.of(null) });
}
