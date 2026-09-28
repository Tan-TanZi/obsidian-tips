/**
 * 候选面板与内容模板面板共用的定位与滚动辅助。
 * 抽成独立模块是因为两个面板的 UI 完全不同，但贴边、翻上、限高这套规则完全一致。
 */

/** 面板的定位锚点：{top, bottom} 是锚点区域的上下边缘，用于决定放在其下方还是上方 */
export interface PickerAnchor {
	/** 水平参考位置，面板左边缘与之对齐 */
	left: number;
	/** 锚点区域上边缘 */
	top: number;
	/** 锚点区域下边缘 */
	bottom: number;
}

const VIEWPORT_MARGIN = 8;
/** 语言候选面板与锚点的间距 */
export const PICKER_ANCHOR_GAP = 6;
/** 内容模板面板要更松一些：它带预览区、视觉上更重，贴太近会顶到光标那行文字上 */
export const SNIPPET_ANCHOR_GAP = PICKER_ANCHOR_GAP + 15;
/** 面板高度上限，与 styles.css 中的兜底值保持一致 */
const MAX_PANEL_HEIGHT = 340;

/**
 * 计算并写入面板位置。
 *
 * 三条规则：
 * 1. 水平方向始终与锚点左边缘对齐，只做视口收拢，不左右偏移；
 * 2. 垂直方向优先放在锚点下方，下方放不下完整内容、且上方更宽裕时才翻到上方；
 * 3. 高度严格限制在所选那一侧的可用空间内——宁可面板矮一点（内部本来就能滚动），
 *    也不能溢出屏幕。
 *
 * 第 3 条是修过的坑：早先的实现给高度设了下限（最少 140px），当下方只剩几十像素时
 * 面板依然按 140px 撑开、溢出屏幕底部，随后坐标修正又把面板往上推，最终盖住光标。
 * 同时因为 offsetHeight 读到的是被压过的旧高度，「放上还是放下」的判断也会接连失真。
 * 所以这里先清空 maxHeight 量出真实高度，再决定方向，最后用一个不超过可用空间的限高。
 *
 * @param gap 面板与锚点之间的间距，两类面板取值不同（模板面板要松一些）
 */
export function placePicker(
	el: HTMLElement,
	anchor: PickerAnchor,
	gap: number = PICKER_ANCHOR_GAP,
): void {
	// 位置一律通过 CSS 变量下发，由 styles.css 里的 .tips-picker 消费。
	// 不用 setCssProps 直接写 top/left 这类普通属性——审核规则只认可「CSS 类」或「CSS 变量」两种形式。
	el.setCssProps({ '--tips-picker-max-height': 'none' });

	const width = el.offsetWidth;
	const height = el.offsetHeight;
	const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
	const left = Math.min(Math.max(anchor.left, VIEWPORT_MARGIN), maxLeft);

	const spaceBelow = window.innerHeight - anchor.bottom - gap - VIEWPORT_MARGIN;
	const spaceAbove = anchor.top - gap - VIEWPORT_MARGIN;

	const preferAbove = spaceBelow < height && spaceAbove > spaceBelow;
	const space = Math.max(0, preferAbove ? spaceAbove : spaceBelow);
	const maxHeight = Math.min(MAX_PANEL_HEIGHT, space);

	const shared = {
		'--tips-picker-max-height': `${Math.round(maxHeight)}px`,
		'--tips-picker-left': `${Math.round(left)}px`,
	};

	if (preferAbove) {
		// 用 bottom 固定底边：过滤后内容变少时面板向下收，始终贴着锚点
		el.setCssProps({
			...shared,
			'--tips-picker-top': 'auto',
			'--tips-picker-bottom': `${Math.round(window.innerHeight - anchor.top + gap)}px`,
		});
	} else {
		// 顶边固定贴着锚点下边缘。高度已限制在 spaceBelow 之内，底边不会溢出，
		// 因此不需要再对 top 做位移修正——那正是以前盖住光标的原因。
		el.setCssProps({
			...shared,
			'--tips-picker-top': `${Math.round(Math.max(VIEWPORT_MARGIN, anchor.bottom + gap))}px`,
			'--tips-picker-bottom': 'auto',
		});
	}
}

/**
 * 让列表内的某一项滚入可见区域。
 * 不用 scrollIntoView：它会连带滚动外层容器，在编辑器更新流程中途调用容易引发连锁重排。
 */
export function scrollItemIntoView(listEl: HTMLElement, itemEl: HTMLElement): void {
	const top = itemEl.offsetTop;
	const bottom = top + itemEl.offsetHeight;
	const viewTop = listEl.scrollTop;
	const viewBottom = viewTop + listEl.clientHeight;

	if (top < viewTop) listEl.scrollTop = top;
	else if (bottom > viewBottom) listEl.scrollTop = bottom - listEl.clientHeight;
}
