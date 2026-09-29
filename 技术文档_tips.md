# Tips 技术文档

> 面向未来的自己：记录每个功能**怎么实现的**、**关键代码在哪**、**哪些地方踩过坑**。
>
> 建议阅读顺序：先看「一、简介」和「二、技术规格」建立全局印象，之后按需跳到「三、功能实现」的具体章节。做改动前先扫一眼「四、踩过的坑」，那里每一条都是真实踩过的，重复踩的概率很高。

---

## 一、简介

### 基本信息

| 项 | 值 |
| --- | --- |
| 插件 id | `tips` |
| 显示名 | Tips |
| 适用版本 | v3.x（本文档随代码演进，最后核对于 3.1.0） |
| 最低兼容 | Obsidian **1.8.7** |
| 支持平台 | 桌面端 + 移动端（`isDesktopOnly: false`） |
| 作者 | Tan-TanZi |
| 许可 | MIT |
| 构建产物体积 | 见「五、审核与发布」的体积表 |
| 第三方运行时依赖 | **无**（全部代码自己写，仅编译期依赖 CodeMirror 类型与 Obsidian API 类型） |

> 体积说明：`main.js` 里绝大部分是内置语言表（约 100 条）和六语文案。真正的逻辑代码量并不大。

### 它解决什么问题

1. **Obsidian 原生没有代码块语言选择器**。只能手写 ` ```java ` 这种 info string，容易写错、不方便。
2. **很多插件靠代码块触发**（如 sketch-mechanisms 的 `mechanism`、word-cloud 的 `wordcloud`），时间一长就忘了激活名。

### 一句话架构

```
CodeMirror 6 扩展（行装饰 + Widget 按钮）
        │
        ├── 输入 ``` ──► 双栏候选面板（语言 / 插件+自定义）
        ├── 悬浮按钮 ──► 同上
        └── 内容首行 ? ──► 内容模板面板（名字 / 预览）
                │
                ▼
        选中即改写文档（dispatch changes）
```

两条核心原则贯穿始终：

1. **只用公开 API**。`Vault.configDir`、`Vault.adapter`、`registerEditorExtension`、CodeMirror 6 的公开扩展点——不碰 `app.plugins` 这类内部对象，这既是审核要求，也保证了移动端可用。
2. **绝不打扰光标**。悬浮按钮只负责"选语言"，点击不改光标位置；只有用户本来就在语言行上时，选完才把光标移到新语言之后。

---

## 二、技术规格

### 技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 语言 | **TypeScript 5.5** | `strict` 模式，`tsc -noEmit -skipLibCheck` 做类型检查 |
| 打包 | **esbuild 0.25.5** | `esbuild.config.mjs` 区分 dev / production |
| 样式 | **CSS**（纯手写，无预处理器） | 所有颜色走 Obsidian 主题变量，自动适配明暗主题 |
| 编辑器扩展 | **CodeMirror 6** | `@codemirror/state` 6.5.0、`@codemirror/view` 6.38.6 |
| 插件 API | **obsidian 1.13.1**（仅类型） | 运行时由 Obsidian 注入 |
| i18n | **自研**，无第三方库 | 六语种，见 `src/i18n.ts` |
| DOM | Obsidian helper：`createDiv` / `createSpan` / `createEl` | 审核要求，禁用 `document.createElement` |

### 依赖清单（`package.json`）

```json
"devDependencies": {
	"@codemirror/state": "6.5.0",
	"@codemirror/view": "6.38.6",
	"@types/node": "^18.19.0",
	"esbuild": "0.25.5",
	"obsidian": "1.13.1",
	"typescript": "^5.5.0"
}
```

**没有任何 `dependencies`**——运行时不引入任何第三方包，全部打进 `main.js`。

### 构建命令

```bash
npm install
npm run dev     # 监听模式，改动即编译（node esbuild.config.mjs）
npm run build   # 类型检查 + 生产构建
                #   = tsc -noEmit -skipLibCheck && node esbuild.config.mjs production
```

发布产物共三个文件：`main.js`、`manifest.json`、`styles.css`。

### 运行环境约束

- **最低 Obsidian 1.8.7**：因为用了 `getLanguage()`（1.8.7 引入），用来读取界面语言。
- **移动端可用**：扫描只读 `main.js` / `styles.css` / `tips.json` / `community-plugins.json`，全部通过 `Vault.adapter`，不依赖 Node API。

### 数据存储

| 数据 | 位置 | 生命周期 |
| --- | --- | --- |
| 用户设置 + 模板 | `<vault>/.obsidian/plugins/tips/data.json` | 永久，由 `saveData()` 落盘 |
| 扫描结果（插件代码块名） | 内存 `this.scanned` | 每次重扫重建 |
| 变量式注册的插件清单 | 内存 `this.unparsed` | 每次重扫重建 |
| 插件附带模板 | 内存 `this.bundled` | 每次重扫重建（**同时会并入 data.json**，见功能 7） |
| 候选栏缓存 | 内存 `this.cachedColumns` | `invalidateCandidates()` 时清空 |

### 目录结构

```
tips/
├── src/
│   ├── main.ts              # 插件入口：设置、命令、扫描调度、候选与模板的对外接口
│   ├── settings.ts          # 设置页
│   ├── i18n.ts              # 六语文案与语言解析
│   ├── types.ts             # 设置、候选、模板类型
│   ├── data/languages.ts    # 内置语言表与 Obsidian 内置处理器
│   ├── core/
│   │   ├── preferences.ts   # 设置合并与规范化
│   │   ├── scanner.ts       # 扫描插件代码块名 + 附带 tips.json
│   │   ├── snippets.ts      # 模板：剥围栏、规范化、导入合并
│   │   └── store.ts         # 候选合并、过滤与排序
│   ├── editor/
│   │   ├── codeblocks.ts    # 围栏检测、? 触发点、替换范围计算
│   │   └── extension.ts     # CodeMirror 6 扩展：按钮 + 面板时机（本项目最复杂的文件）
│   └── ui/
│       ├── picker.ts         # 双栏语言候选面板
│       ├── position.ts       # 两个面板共用的定位与滚动辅助
│       ├── snippet-picker.ts # 内容模板面板
│       └── snippet-modals.ts # 模板编辑 / 导入 / 导出弹窗
├── styles.css
├── manifest.json
├── versions.json
├── package.json
├── esbuild.config.mjs
├── version-bump.mjs
├── img/                        # README 截图
├── README.md                   # 英文（主）
├── README_ZH.md                # 中文
├── CONTRIBUTING.md             # 贡献指南
└── 技术文档_tips.md             # 本文档
```

### 参考文档

- Obsidian 插件开发：<https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin>
- Obsidian API 类型：<https://github.com/obsidianmd/obsidian-api>
- 插件审核要求：<https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines>
- CodeMirror 6 文档：<https://codemirror.net/docs/>
- CodeMirror 6 装饰与 Widget：<https://codemirror.net/examples/decoration/>

---

## 三、功能实现

### 1. 代码块识别（围栏解析）

**文件**：`src/editor/codeblocks.ts`

这是所有功能的地基。Obsidian 编辑模式下的代码块不能用语法树取——那样太重，而且未闭合的围栏拿不到节点。所以用**行级正则**自己扫。

#### 围栏正则

```ts
/** 最多允许 3 个前导空格，其后是三个及以上反引号或波浪号 */
export const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
```

`match[1]` 是围栏本身，`match[2]` 是后面的内容（起始行上是 info string，结束行上应当是空白）。

#### 扫描与配对

```ts
export function collectCodeBlocks(doc: Text, upToLine: number, fromLine = 1): CodeBlockInfo[] {
	// ...
	let open: OpenBlock | null = null;

	for (let lineNumber = start; lineNumber <= limit; lineNumber++) {
		const line = doc.line(lineNumber);
		const match = FENCE_RE.exec(line.text);
		if (!match) continue;

		const fence = match[1];
		const rest = match[2];
		// ...
		const fenceChar = fence.charAt(0);

		if (!open) {
			// 反引号围栏的 info string 中不允许再出现反引号
			if (fenceChar === '`' && rest.includes('`')) continue;
			const afterFence = line.text.length - rest.length;
			const leading = rest.length - rest.trimStart().length;
			const infoFrom = afterFence + leading;
			const infoTo = afterFence + rest.trimEnd().length;
			open = {
				startLine: lineNumber,
				fenceChar,
				fenceLen: fence.length,
				infoFrom,
				infoTo,
				info: line.text.slice(infoFrom, infoTo),
			};
			continue;
		}

		// 结束围栏：字符相同、长度不短于起始围栏、其后只有空白
		if (fenceChar === open.fenceChar && fence.length >= open.fenceLen && rest.trim().length === 0) {
			blocks.push({ ...open, endLine: lineNumber, closed: true });
			open = null;
		}
	}

	if (open) {
		blocks.push({ ...open, endLine: doc.lines, closed: false });
	}
	return blocks;
}
```

**要点**：

- `infoFrom` / `infoTo` 是**相对起始行行首**的偏移，不是绝对文档位置。绝对位置要用 `line.from + infoFrom` 还原。这样存是为了对文档变化更宽容。
- **未闭合的围栏也返回**（`closed: false`），这是"刚敲下三个反引号就能弹出面板"的前提。
- ` ``` ` 的 info string 里不允许出现反引号——否则 ```` ```a`b ```` 会被误解成结束围栏。

#### 关键难点：超长文档不能每次全扫

每次按键都扫全文，几千行的笔记会卡。所以只扫光标附近一段：

```ts
/** 单次扫描的最大行数，避免超长文档每次输入都全量扫描 */
const SCAN_WINDOW_LINES = 3000;
/** 窗口起点向前回溯的行数，用于对齐到最近的围栏行 */
const SCAN_LOOKBEHIND = 200;

// ...
if (limit - start > SCAN_WINDOW_LINES) {
	start = limit - SCAN_WINDOW_LINES;
	const behind = Math.max(1, start - SCAN_LOOKBEHIND);
	for (let lineNumber = start; lineNumber >= behind; lineNumber--) {
		if (FENCE_RE.test(doc.line(lineNumber).text)) {
			start = lineNumber;
			break;
		}
	}
}
```

**为什么需要回溯**：如果窗口起点恰好落在某个代码块**中间**，那个代码块的起始围栏就被切掉了，于是它的结束围栏会被误判成"新代码块的起始围栏"，后面全乱。向前最多回溯 200 行找一个围栏行，能把起点对齐到块边界。

**这条是真踩过的坑**：最初只做窗口截断不做回溯，长文档里滚动到某些位置时，悬浮按钮会出现在莫名其妙的地方。

**已知副作用**：跨越数千行的超长代码块仍可能识别不到（超出窗口且回溯也找不到）。此时让用户用命令面板打开选择器。这是有意的取舍，已写进 README 的「已知限制」。

---

### 2. 悬浮按钮

**文件**：`src/editor/extension.ts`（`CodeblockButtonWidget` 类）

#### 实现方式

用 CodeMirror 6 的 `Decoration.line()` + `Decoration.widget()`：

```ts
private buildDecorations(): DecorationSet {
	const doc = this.view.state.doc;
	const builder = new RangeSetBuilder<Decoration>();
	const upToLine = doc.lineAt(this.view.viewport.to).number;

	this.blocks = collectCodeBlocks(doc, upToLine);
	if (!this.plugin.settings.showHoverButton) return builder.finish();

	const viewFrom = this.view.viewport.from;
	const viewTo = this.view.viewport.to;

	for (const block of this.blocks) {
		const endLine = doc.line(block.endLine);
		if (endLine.to < viewFrom) continue;
		const startLine = doc.line(block.startLine);
		if (startLine.from > viewTo) break;

		// 给最后一行加类，作为绝对定位的参照
		builder.add(endLine.from, endLine.from, Decoration.line({ class: 'tips-cb-lastline' }));
		// 在行尾挂一个 widget
		builder.add(
			endLine.to,
			endLine.to,
			Decoration.widget({
				widget: new CodeblockButtonWidget(/* ... */),
				side: 1,
			}),
		);
	}
	return builder.finish();
}
```

**要点**：

- `RangeSetBuilder` **要求 add 的位置按升序**，所以循环里必须 `continue` 跳过视口之前、`break` 越过视口之后。乱序 add 会抛异常。
- 按钮挂在**代码块最后一行**的末尾，长代码块的话按钮在底部——用户视线通常在块中间，所以还要配合 hover 逻辑。
- 按钮 DOM 位置用 CSS：

```css
.cm-line.tips-cb-lastline {
	position: relative;   /* 给绝对定位的按钮当参照 */
}

.tips-cb-btn {
	position: absolute;
	right: 6px;
	bottom: 2px;
	z-index: 5;
	/* ... */
	opacity: 0;
	pointer-events: none;
	transition: opacity 120ms ease, color 120ms ease, border-color 120ms ease;
}

.tips-cb-btn.is-visible {
	opacity: 0.85;
	pointer-events: auto;
}
```

**为什么用 opacity 而不是 display**：`display: none` 会让元素脱离布局，`getBoundingClientRect()` 拿到全零，面板就没法锚定到按钮位置了。

#### 悬浮态的处理

鼠标在编辑器里移动时，要判断"当前悬停在第几个代码块"：

```ts
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
```

`mousemove` 用 `requestAnimationFrame` 节流，一帧最多处理一次坐标：

```ts
private readonly onMouseMove = (event: MouseEvent): void => {
	this.pendingMouse = { x: event.clientX, y: event.clientY };
	if (this.mouseRaf !== null) return;
	this.mouseRaf = window.requestAnimationFrame(() => {
		this.mouseRaf = null;
		const pending = this.pendingMouse;
		if (pending) this.updateHover(pending.x, pending.y);
	});
};
```

**难点**：按钮是 widget，`buildDecorations()` 重跑时 DOM 会被整个重建，`is-visible` 类丢失，鼠标明明还在代码块里按钮却消失了。所以重建后要**下一帧再补一次**可见性：

```ts
this.decorations = this.buildDecorations();
// 按钮 DOM 会在本帧之后重建，下一帧再补一次可见性，避免悬停状态丢失
this.applyHoverState();
this.scheduleHoverApply();
```

`setHoverBlock` 里也有意**不做**"值没变就跳过"的短路：

```ts
private setHoverBlock(startLine: number | null): void {
	// 不做「值未变化就跳过」的短路：按钮可能刚被重建，需要重新套用可见性
	this.hoverBlockStart = startLine;
	this.applyHoverState();
}
```

#### 点击不改光标

```ts
el.addEventListener('mousedown', (event) => {
	event.preventDefault();
	event.stopPropagation();
	this.onClick(this.block, el);
});
```

必须 `preventDefault()`，否则点击会让编辑器抢走焦点、光标跳到别处。

选完语言后写回文档，也只在光标本来就在语言区时才移动光标：

```ts
const head = this.view.state.selection.main.head;
if (head >= from && head <= to) {
	this.view.dispatch({ changes, selection: { anchor: from + candidate.value.length } });
} else {
	this.view.dispatch({ changes });
}
```

---

### 3. 双栏候选面板

**文件**：`src/ui/picker.ts`（UI）+ `src/core/store.ts`（数据）+ `src/ui/position.ts`（定位）

#### 不用第三方面板组件

面板是直接挂在 `document.body` 上的 `fixed` 浮层，完全手写：

```ts
const el = createDiv();
el.className = 'tips-picker';
el.setAttribute('role', 'listbox');
// 交给浏览器按内容判断书写方向，阿拉伯语等 RTL 语言才能正常排版
el.setAttribute('dir', 'auto');
// 宽度来自设置，通过 CSS 变量交给样式表，方便用户再用 CSS 片段覆盖
el.setCssProps({ '--tips-picker-width': `${Math.round(options.width)}px` });

// 面板内部的点击不冒泡到 document，避免被「点击外部关闭」逻辑误伤。
el.addEventListener('mousedown', (event) => {
	event.stopPropagation();
});
```

**为什么 `stopPropagation`**：关闭逻辑监听的是 `document` 上的 `mousedown`，面板内部点击若不拦住，选中的瞬间面板就被关了。

#### 两栏的键盘导航

状态只有三个：

```ts
private items: Candidate[][] = [[], []];
private activeCol: 0 | 1 = 0;
private activeIndex: number[] = [0, 0];
```

上下移动走到尽头会跳到另一栏：

```ts
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
```

#### 过滤与排序

```ts
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
```

四档：完全相等 > 前缀 > 包含 > 子序列（模糊匹配）。所以 `wc` 能命中 `wordcloud`，而 `java` 一定排在 `javascript` 前面。

排序固定用 `'en'` 区域：

```ts
function compareByValue(a: Candidate, b: Candidate): number {
	return a.value.localeCompare(b.value, 'en');
}
```

**为什么写死 `'en'`**：否则排序结果会随用户的系统语言变化，同一个列表在不同机器上顺序不同，很难排查。

#### 定位（`src/ui/position.ts`）

两个面板共用 `placePicker()`。三条规则：

1. 水平方向**始终与锚点左边缘对齐**，只做视口收拢，不左右偏移；
2. 垂直方向优先放在锚点下方，下方放不下完整内容、且上方更宽裕时才翻到上方；
3. 高度严格限制在所选那一侧的可用空间内。

```ts
export function placePicker(el: HTMLElement, anchor: PickerAnchor, gap = PICKER_ANCHOR_GAP): void {
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
```

**第一行 `'--tips-picker-max-height': 'none'` 是关键**：量高度前必须先把上次的限高清掉，否则 `offsetHeight` 读到的是被压过的旧值，"放上还是放下"的判断会跟着失真。

**用 `bottom` 而不用 `top` 来固定上翻面板**：过滤后内容变少时，面板底边不动、顶边向下收，视觉上始终贴着锚点。若固定 `top`，面板会保持原高度往下长，和锚点之间裂开一道缝。

滚动列表项也不能用原生 API：

```ts
export function scrollItemIntoView(listEl: HTMLElement, itemEl: HTMLElement): void {
	const top = itemEl.offsetTop;
	const bottom = top + itemEl.offsetHeight;
	const viewTop = listEl.scrollTop;
	const viewBottom = viewTop + listEl.clientHeight;

	if (top < viewTop) listEl.scrollTop = top;
	else if (bottom > viewBottom) listEl.scrollTop = bottom - listEl.clientHeight;
}
```

**为什么不用 `scrollIntoView()`**：它会把**所有**可滚动祖先一起滚动。面板挂在 `document.body` 上，在 CodeMirror 的更新流程中途调用它，会连带滚动编辑器，引发连锁重排甚至光标跳动。

#### 面板打开时机的判断（`syncAfterDocChange`）

```ts
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
```

`suppressAutoOpen` 这个标志非常重要：

```ts
/**
 * 抑制「由插件自身引发」的那一次变更再触发自动弹出。
 * 典型场景：用户从面板选中候选，改写语言行本身就是一次语言行的文档变更，
 * 若不抑制，面板会立刻被「在语言行编辑时打开候选」的规则重新弹回来。
 */
private suppressAutoOpen = false;
```

所有会改文档的地方（`applyCandidate`、`applySnippet`、`openPickerFor`）都用 `try/finally` 包着这个标志：

```ts
this.suppressAutoOpen = true;
try {
	// ... dispatch changes
} finally {
	this.suppressAutoOpen = false;
}
```

**这是本项目最隐蔽的坑之一**：不加这个标志，会出现"选完立刻又弹出面板"的死循环观感。

---

### 4. 候选来源与插件扫描

**文件**：`src/core/scanner.ts` + `src/core/store.ts` + `src/data/languages.ts`

#### 候选的五个来源

| 来源 | 实现 |
| --- | --- |
| 内置语言（约 100 条） | `src/data/languages.ts` 静态表 |
| Obsidian 内置处理器 | 同上，`OBSIDIAN_PROCESSORS`（`mermaid` / `math` / `query`） |
| 插件注册的代码块名 | 扫 `main.js` + `styles.css` |
| 插件附带的 `tips.json` 标识符 | 扫插件目录（功能 7） |
| 用户自定义条目 | `settings.customEntries` |

合并入口是 `buildCandidates()`：

```ts
export function buildCandidates(
	settings: TipsSettings,
	scanned: ScannedProcessor[],
	bundled: BundledSnippetSet[],
	lang: Lang,
	t: Translate,
): CandidateColumns {
	const languages: Candidate[] = [];
	const plugins: Candidate[] = [];
	const seenPluginValues = new Set<string>();

	// ... 内置语言 ...

	// ... 自定义条目 ...

	if (settings.scanPlugins) {
		for (const item of scanned) {
			seenPluginValues.add(item.value);
			// ... push kind: 'plugin'
		}
	}

	// 插件随包附带的 tips.json：有些插件用变量注册，名字扫不出来，
	// 但作者在 tips.json 里写了标识符，这里补进候选栏。
	// 独立受 scanBundledSnippets 开关控制；已被扫描结果覆盖的标识符跳过。
	if (settings.scanBundledSnippets) {
		for (const set of bundled) {
			const base = t('panel.note.plugin', { name: set.pluginName });
			for (const identifier of Object.keys(set.table).sort((a, b) => a.localeCompare(b, 'en'))) {
				if (seenPluginValues.has(identifier)) continue;
				seenPluginValues.add(identifier);
				plugins.push({
					value: identifier,
					kind: 'plugin',
					note: set.enabled ? base : `${base} (${disabledSuffix})`,
					pluginId: set.pluginId,
					pluginName: set.pluginName,
					pluginEnabled: set.enabled,
				});
			}
		}
	}

	if (settings.sortAlphabetically) {
		languages.sort(compareByValue);
		plugins.sort(compareByValue);
	}

	return { languages, plugins };
}
```

**注意 `seenPluginValues` 去重**：同一个标识符可能既被扫描到、又写在 `tips.json` 里，必须只出现一次（优先用扫描结果，它带 `enabled` 状态）。

**注意两个开关是独立的**：`scanPlugins` 管 `main.js` 扫描，`scanBundledSnippets` 管 `tips.json`。所以 bundled 分支判断的是后者，不是前者。

#### 扫描 `main.js` 提取注册名

```ts
/**
 * 匹配 registerMarkdownCodeBlockProcessor 的调用，形如：
 *
 * - `registerMarkdownCodeBlockProcessor("xxx", …)` → 第一个分支捕获字面量名字
 * - `registerMarkdownCodeBlockProcessor(nombre, …)` → 第二个分支只用于**察觉**这是变量式注册
 */
const PROCESSOR_RE =
	/register(?:Markdown)?CodeBlockProcessor\s*\(\s*(?:(["'`])([^"'`\s]{1,64})\1|([A-Za-z_$][\w$]*)|([^\s)]))/g;

/** 匹配「变量名 = "字面量"」形式的赋值，用于把常量还原成实际的代码块名 */
const ASSIGNMENT_RE =
	/(?:^|[,;{(\s])([A-Za-z_$][\w$]*)\s*=\s*(["'`])([^"'`\r\n]{1,64})\2/g;
```

```ts
export function parseRegisteredNames(source: string): ParsedProcessors {
	const names: string[] = [];
	const seen = new Set<string>();
	const unresolved: string[] = [];
	let unparsedCount = 0;

	/**
	 * 收录一个候选名字，返回 false 表示它是动态拼接出来的、不能用。
	 * 带插值的模板字符串（`prefix${x}`）运行时才算得出内容，两个来源都要拦。
	 */
	const accept = (value: string): boolean => {
		if (value.includes('${')) return false;
		if (seen.has(value)) return true;
		seen.add(value);
		names.push(value);
		return true;
	};

	PROCESSOR_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = PROCESSOR_RE.exec(source)) !== null) {
		const literal = match[2];
		if (literal) {
			if (!accept(literal)) unparsedCount++;
			continue;
		}
		// 第二个分支：参数是标识符，先记下来，稍后尝试还原成常量
		const variable = match[3];
		if (variable) {
			unresolved.push(variable);
			continue;
		}
		// 第三个分支：参数既不是字面量也不是标识符（对象字面量等），无法解析
		unparsedCount++;
	}

	if (unresolved.length > 0) {
		const constants = collectStringConstants(source);
		for (const variable of unresolved) {
			const values = constants.get(variable);
			const only = values && values.length === 1 ? values[0] : undefined;
			if (only && accept(only)) continue;
			unparsedCount++;
		}
	}
	// ...
}
```

三个要点：

1. **带插值的模板串一律拦掉**：`accept()` 检查 `value.includes('${')`，因为 `prefix${x}` 的内容运行时才算得出。
2. **常量还原只在唯一时采纳**：`values.length === 1`。同名变量被赋过多个值就无从判断，宁可维持"未识别"，也不要把猜错的名字塞进候选列表。
3. **正则用 `g` 标志 + `lastIndex = 0` 重置**：模块级正则带 `g` 时 `lastIndex` 会在调用间残留，不重置会从上次的位置接着扫，第二次调用直接返回 `null`。

#### 扫描 `styles.css` 提取 `.block-language-*`

```ts
/**
 * 匹配 Obsidian 为代码块容器生成的类名。
 * 插件只要为自己的代码块写过样式，就会留下这条痕迹——零误报。
 */
const BLOCK_LANGUAGE_RE = /\.block-language-([A-Za-z0-9_-]{1,64})/g;

/** 从 styles.css 里提取 `.block-language-xxx`，这些就是代码块名 */
export function parseBlockLanguageClasses(css: string): string[] {
	const names: string[] = [];
	const seen = new Set<string>();

	BLOCK_LANGUAGE_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = BLOCK_LANGUAGE_RE.exec(css)) !== null) {
		const name = match[1];
		if (!name || seen.has(name)) continue;
		seen.add(name);
		names.push(name);
	}
	return names;
}
```

插件为自己的代码块写样式时，会在 `styles.css` 里留下 `.block-language-xxx` 类名。这条线索**零误报**，因为只有真的用过这个代码块才会写这个类。

实测：Excalidraw 的 `excalidraw`（来自 CSS）和 `excalidraw-script-install`（来自常量解析）都能认出。

#### 常量收集

```ts
/** 收集源码里的字符串常量：变量名 → 它被赋过的所有字面量 */
function collectStringConstants(source: string): Map<string, string[]> {
	const table = new Map<string, string[]>();
	ASSIGNMENT_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = ASSIGNMENT_RE.exec(source)) !== null) {
		const name = match[1];
		const value = match[3];
		if (!name || !value) continue;

		const existing = table.get(name);
		if (existing) {
			if (!existing.includes(value)) existing.push(value);
		} else {
			table.set(name, [value]);
		}
	}
	return table;
}
```

**注意值是数组**：同一个变量可能被赋过多个值（例如 `let x = "a"; x = "b"`），全都收集起来，由调用方判断"是不是唯一"。用数组而不是 `Set` 是为了让"唯一性"判断直白。

#### 变量式注册的检测

```ts
/** 某个代码块标识符的合法性：非空，且不含空白、反引号、波浪号。 */
export function isValidIdentifier(value: string): boolean {
	return value.length > 0 && !/[\s`~]/.test(value);
}
```

如果一个插件的注册名既非字面量、又没有唯一常量可解，就记进 `unparsed`，设置页会提示用户：

```ts
if (item.unparsedCount > 0) {
	unparsed.push({
		pluginId: item.pluginId,
		pluginName: item.pluginName,
		count: item.unparsedCount,
	});
}
```

#### 启用状态

```ts
async function readEnabledPluginIds(app: App): Promise<Set<string> | null> {
	try {
		const path = normalizePath(`${app.vault.configDir}/community-plugins.json`);
		const raw = await app.vault.adapter.read(path);
		const parsed: unknown = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			return new Set(parsed.filter((item): item is string => typeof item === 'string'));
		}
	} catch {
		// 文件不存在或不是合法 JSON：忽略
	}
	return null;
}
```

读**仓库配置文件**，不用 `app.plugins` 内部对象。返回 `null` 时调用方按"全部已启用"处理（宽松兜底，不会把用户已启用的插件标成禁用）。

#### 批处理与去重

```ts
for (let index = 0; index < folders.length; index += BATCH_SIZE) {
	const batch = folders.slice(index, index + BATCH_SIZE);
	const settled = await Promise.all(batch.map((folder) => scanOnePlugin(adapter, folder, enabledIds)));
	// ...
}
```

`Promise.all` 按批并发，避免一次打开几百个文件句柄。

同名处理器被多个插件注册时保留第一个，优先保留已启用的：

```ts
function dedupe(items: ScannedProcessor[]): ScannedProcessor[] {
	const map = new Map<string, ScannedProcessor>();
	for (const item of items) {
		const existing = map.get(item.value);
		if (!existing) {
			map.set(item.value, item);
			continue;
		}
		if (!existing.enabled && item.enabled) map.set(item.value, item);
	}
	return [...map.values()].sort((a, b) => a.value.localeCompare(b.value));
}
```

#### 候选缓存

扫描很贵，所以候选只在设置变化或重扫时重建一次：

```ts
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
```

`invalidateCandidates()` 把 `cachedColumns` 置 `null`，下次访问时重建。

---

### 5. 内容模板面板

**文件**：`src/editor/codeblocks.ts`（触发点）+ `src/editor/extension.ts`（时机）+ `src/ui/snippet-picker.ts`（UI）

#### 触发规则：`?` 必须是内容区第一个字符

```ts
/**
 * 判断光标是否处于「内容模板触发」状态。
 *
 * 规则（刻意收紧，避免误触）：代码块内容区的**第一个字符**必须是 `?`，前面不允许有空白。
 * 这样 `a ? b : c`、`# 有疑问?` 这类普通写法都不会触发。
 */
export function findSnippetTrigger(
	doc: Text,
	pos: number,
	blocks: CodeBlockInfo[],
): SnippetTrigger | null {
	const cursorLine = doc.lineAt(pos).number;

	for (const block of blocks) {
		// 光标要落在内容区里（起始围栏行之后）
		if (cursorLine <= block.startLine || cursorLine > block.endLine) continue;

		const firstContentLineNumber = block.startLine + 1;
		if (firstContentLineNumber > doc.lines || firstContentLineNumber > block.endLine) return null;

		const firstContentLine = doc.line(firstContentLineNumber);
		if (!firstContentLine.text.startsWith('?')) return null;

		const startFenceLine = doc.line(block.startLine);
		const contentFrom = Math.min(startFenceLine.to + 1, doc.length);
		const contentTo = block.closed ? doc.line(block.endLine).from : doc.length;
		if (contentFrom > contentTo) return null;

		return {
			block,
			query: firstContentLine.text.slice(1),
			contentFrom,
			contentTo,
			closed: block.closed,
		};
	}
	return null;
}
```

**为什么这么严**：`?` 太常见了——三元运算符 `a ? b : c`、问句、正则……只要放宽到"内容里出现 `?`"，就会天天误触。限定"第一个字符"，代价是用户想触发时必须把 `?` 顶到最前面，但换来的是零误报。

#### 替换整段内容

```ts
/** 计算把整个内容区替换成 body 所需的文档改动（围栏本身保持不动）。 */
export function snippetReplacement(trigger: SnippetTrigger, body: string): SnippetReplacement {
	// 末尾换行统一处理，避免与内容区自带的换行叠加出空行
	const cleaned = body.replace(/\n+$/, '');
	// 已闭合时，内容区末尾那个换行也在替换范围内，需要补回来
	const insert = trigger.closed ? `${cleaned}\n` : cleaned;
	return {
		from: trigger.contentFrom,
		to: trigger.contentTo,
		insert,
		cursor: trigger.contentFrom + cleaned.length,
	};
}
```

**这段很容易写错**。`contentTo` 的定义是：

- 已闭合：结束围栏那一行的**行首**（`doc.line(block.endLine).from`）——所以内容区末尾的换行也在替换范围内，插入时必须补回来
- 未闭合：文档末尾（`doc.length`）

`body` 末尾的换行先去掉（`replace(/\n+$/, '')`），否则和内容区自带的换行叠加会产生多余空行。

**如果这段改坏了，症状是**：要么每次插入都多一个空行，要么结束围栏被顶到文档末尾。

#### 与语言面板互斥

```ts
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
	// ...
}
```

面板打开后每次文档变化都会走 `syncSnippetPicker()`，面板已存在时只更新过滤词并重新定位，不重建。

#### 模板数据：own 与 bundled 合并

```ts
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
```

面板永远用 `getSnippets()`（含 bundled），设置页里"用户自己的"用 `getOwnSnippets()`。

#### 预览区

```ts
const previewEl = createEl('pre');
previewEl.className = 'tips-snippet-preview';
```

```css
.tips-snippet-preview {
	padding: 8px 10px;
	overflow: auto;
	font-family: var(--font-monospace);
	font-size: var(--font-ui-smaller);
	line-height: 1.5;
	tab-size: 4;
	white-space: pre;   /* 保留原始格式，不做 markdown 渲染 */
}
```

**用 `<pre>` + `white-space: pre` 而不是渲染 markdown**：模板内容是要插入到代码块里的**原始文本**，渲染成 HTML 反而看不清真实格式（缩进、换行）。

#### 过滤只匹配名字

```ts
private render(): void {
	const all = this.options.getItems();
	this.items = filterSnippets(all, this.query);
	// ...
}
```

```ts
export function filterSnippets(items: Snippet[], query: string): Snippet[] {
	// 只匹配 name，不搜 body
}
```

**为什么不搜正文**：模板正文往往很长，搜正文会让过滤结果难以预期，而且用户输入 `?` 后面跟的通常是名字的一部分。

---

### 6. 模板的导入 / 导出

**文件**：`src/core/snippets.ts`（`mergeImport` / `stringifySnippets` / `parseSnippetFile`）+ `src/ui/snippet-modals.ts`

#### 导出格式：三组分离

```json
{
	"plugins": { "mechanism": [{ "name": "四连杆机构", "body": "type: fourbar" }] },
	"builtin": { "mermaid": [{ "name": "饼图", "body": "pie title X" }] },
	"custom": { "myblock": [{ "name": "私有模板", "body": "..." }] }
}
```

**为什么要分组**：三组在导入时行为完全不同，混在一起的话接收方没法区别对待。

```ts
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
```

#### 导入：三组三套规则

```ts
for (const group of groups) {
	for (const [identifier, list] of Object.entries(group.source)) {
		// 只有自定义组受开关控制
		if (group.isCustom && !options.includeCustom) {
			skippedCustom += list.length;
			continue;
		}

		if (!options.known.has(identifier)) {
			if (!group.isCustom) {
				// 插件组 / 内置组：当前没有这个条目，跳过
				if (!skippedIdentifiers.includes(identifier)) skippedIdentifiers.push(identifier);
				continue;
			}
			// 自定义组：先确认这个标识符本身合法，再登记待补建
			if (!isValidIdentifier(identifier)) {
				if (!skippedIdentifiers.includes(identifier)) skippedIdentifiers.push(identifier);
				continue;
			}
			if (!createdCustomIdentifiers.includes(identifier)) {
				createdCustomIdentifiers.push(identifier);
			}
		}

		let target = table[identifier];
		if (!target) {
			target = [];
			table[identifier] = target;
		}
		const existing = new Set(target.map(snippetKey));

		for (const item of list) {
			const key = snippetKey(item);
			if (existing.has(key)) {
				duplicates++;
				continue;
			}
			existing.add(key);
			target.push(item);
			added++;
		}
	}
}
```

| 组 | 条目不存在时 |
| --- | --- |
| `plugins` | **整段跳过**并提示（没有这个插件，模板没地方放） |
| `builtin` | **整段跳过**并提示 |
| `custom` | **自动补建**该条目（备注留空），因为分享者用的是自己的私有代码块 |

**"已知标识符"的口径要包含 bundled**：

```ts
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
```

**这条是踩过的**：最初忘了把 bundled 的标识符加进来，导致导入一份包含 bundled 条目标识符的文件时，那些模板被误判成"当前没有这个条目"而整段跳过。

#### 去重指纹

```ts
/** 条目的唯一指纹，用于判定「名字和内容都一样」 */
export function snippetKey(snippet: Snippet): string {
	return `${snippet.name}\u0000${snippet.body}`;
}
```

**注意：指纹不含标识符**。这意味着同一个 `name + body` 出现在不同标识符下时，指纹是相同的。在导入去重（同一标识符下比对）里没问题，但**任何跨标识符的指纹集合都会误伤**——见「四、坑」第 6 条。

#### 剥围栏

```ts
/**
 * 去掉整段内容外层的围栏。
 *
 * 只处理「首行是围栏、末行也是围栏」这种整体包裹的写法；只有一边像围栏时按普通内容处理，
 * 这样用户粘贴的代码里若正好有一行 ``` 也不会被误删。
 */
export function stripFence(text: string): string {
	// 防御：data.json 被手工改坏时可能塞进非字符串
	if (typeof text !== 'string') return '';
	const normalized = text.replace(/\r\n?/g, '\n');
	const lines = normalized.split('\n');

	if (lines.length >= 2) {
		const first = lines[0] ?? '';
		const last = lines[lines.length - 1] ?? '';
		if (OPENING_FENCE_RE.test(first) && CLOSING_FENCE_RE.test(last)) {
			return trimBlankEdges(lines.slice(1, -1).join('\n'));
		}
	}
	return trimBlankEdges(normalized);
}
```

**必须首尾都是围栏才剥**。只有一边像围栏时按普通内容处理，否则用户粘贴的代码里如果正好有一行 ```` ``` ````，会被误删。

---

### 7. 插件随包附带 `tips.json`

**文件**：`src/core/scanner.ts`（读取）+ `src/main.ts`（合并）+ `src/settings.ts`（提示块）

#### 设计意图

给插件作者留的分发口子。作者把参考模板写进插件目录下的 `tips.json`，用户装上插件就能用，无需手动导入。

**这个功能的存在意义**：解决**变量式注册**问题。有些插件这样写：

```js
const RENOMBRES = ['_graph', '_system', '_matrix', /* ... */];
RENOMBRES.forEach((nombre) => this.registerMarkdownCodeBlockProcessor(nombre, manejador));
```

静态分析**永远**读不出这些名字。但作者可以在 `tips.json` 里把标识符写清楚，于是用户至少还能在候选面板里选到。

#### 读取

```ts
/** 某个插件通过 tips.json 分发的模板集合 */
export interface BundledSnippetSet {
	pluginId: string;
	pluginName: string;
	/** 该插件当前是否启用；用于在候选面板里标注「已禁用」 */
	enabled: boolean;
	table: SnippetTable;
}

async function readBundledFile(
	adapter: DataAdapter,
	folder: string,
	enabledIds: Set<string> | null,
): Promise<BundledSnippetSet | null> {
	const path = normalizePath(`${folder}/${BUNDLED_SNIPPET_FILE}`);
	try {
		if (!(await adapter.exists(path))) return null;

		const raw = await adapter.read(path);
		// tips.json 就是一张裸表：{ "标识符": [ { name, body } ] }
		const table: SnippetTable = normalizeSnippets(JSON.parse(raw));
		if (Object.keys(table).length === 0) return null;

		const pluginId = folder.split('/').pop() ?? folder;
		const enabled = enabledIds ? enabledIds.has(pluginId) : true;
		let pluginName = pluginId;
		try {
			const manifestRaw = await adapter.read(normalizePath(`${folder}/manifest.json`));
			const manifest: unknown = JSON.parse(manifestRaw);
			if (manifest && typeof manifest === 'object') {
				const name = (manifest as { name?: unknown }).name;
				if (typeof name === 'string' && name.length > 0) pluginName = name;
			}
		} catch {
			// manifest 读不到就退回目录名
		}

		return { pluginId, pluginName, enabled, table };
	} catch (error) {
		console.error(`[tips] 读取 ${path} 失败：`, error);
		return null;
	}
}
```

**要点**：

- `pluginId` 取自**目录名**（`folder.split('/').pop()`），`pluginName` 优先取 `manifest.json` 的 `name`，读不到就退回目录名。
- 文件名严格是 `tips.json`（`BUNDLED_SNIPPET_FILE` 常量）。
- 表格用 `normalizeSnippets()` 清洗，非法结构直接丢弃——不能因为某个插件的 `tips.json` 写坏了就崩掉。

#### 并入本地模板表

`rescan()` 里：

```ts
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
```

```ts
export function mergeBundledSnippets(
	current: SnippetTable,
	bundled: ReadonlyArray<SnippetTable>,
): { table: SnippetTable; changed: boolean; added: number } {
	const table = cloneSnippetTable(current);
	let changed = false;
	let added = 0;

	for (const source of bundled) {
		for (const [identifier, list] of Object.entries(source)) {
			const merged: Snippet[] = [...(table[identifier] ?? [])];

			for (const incoming of list) {
				const index = merged.findIndex((item) => item.name === incoming.name);
				if (index < 0) {
					merged.push({ ...incoming });
					changed = true;
					added++;
					continue;
				}
				const existing = merged[index];
				if (existing && existing.body !== incoming.body) {
					merged[index] = { ...incoming };
					changed = true;
					added++;
				}
			}

			if (merged.length > 0) table[identifier] = merged;
		}
	}

	return { table, changed, added };
}
```

规则：**同名更新 / 新的追加 / 本地独有的保留**。所以作者迭代时删掉的旧条目不会丢，它继续留在本地。

**并入后 bundled 就成了"用户自己的"**：在设置页里能看到、能编辑、能删除，下次重扫又会回来。这是 v3.0.0 的明确取舍，README 里如实写了。

#### 设置页的提示块

```ts
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
```

```css
/* 提示条 */
.tips-warning {
	margin: 10px 0 0;
	padding: 8px 10px;
	border-left: 3px solid var(--text-warning);
	border-radius: var(--radius-s);
	background-color: var(--background-secondary);
	color: var(--text-muted);
	font-size: var(--font-ui-smaller);
	line-height: 1.5;
}

/* 陈述性提示：与警告条同构，只是左侧色条用主题色，表示「这是状态」而非「这是问题」 */
.tips-warning.is-info {
	border-left-color: var(--interactive-accent);
}
```

**用修饰类而不是新类**：两处只有一条 `border-left-color` 不同，复用 `.tips-warning` 能保证内边距、圆角、字号、文字色永远一致。若复制一份新类，以后改样式就得改两处。

---

### 8. 设置页

**文件**：`src/settings.ts`

#### 分组排序

```ts
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
	// ...
	for (const item of this.scanned) {
		pluginGroup(item.pluginId, item.pluginName).values.add(item.value);
	}
	for (const set of this.bundled) {
		const group = pluginGroup(set.pluginId, set.pluginName);
		for (const identifier of Object.keys(set.table)) group.values.add(identifier);
	}
	// ...

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
```

**"其他条目（暂时不可用）"这一组的意义**：用户可能有某个插件的模板，后来把插件卸载了。这些模板不该被静默丢弃，单独归一组用弱化样式（`muted: true`）呈现，让用户自己决定是否清理。

#### 分组默认收起 + 标题带条数

```ts
private renderSnippetGroup(parent: HTMLElement, group: IdentifierGroup): void {
	// 一律默认收起，设置页进来只看到分组名，点开 summary 才展开内容
	const details = parent.createEl('details', { cls: 'tips-snippet-group' });
	if (group.muted) details.addClass('is-muted');
	details.createEl('summary', { text: this.groupLabel(group) });
	// ...
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
```

**用原生 `<details>` / `<summary>`**：折叠展开是浏览器行为，不用自己维护状态。但也因此**状态不持久**——每次设置页重渲染都会被重置为收起。

**注意统计口径**：`groupLabel` 用 `getSnippets()`（含 bundled），与模板面板一致。

#### 标识符行

```ts
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
```

`setDesc()` 写进 `.setting-item-description`，在 `.setting-item-info` 里排在名字**下方**——这是 Obsidian `Setting` 组件的原生布局，不用自己调。

#### 局部刷新

增删模板后不重建整个设置页，只重画那一条：

```ts
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
```

**为什么要局部刷新**：重建整个设置页会丢掉所有 `<details>` 的展开状态，用户刚展开的分组会突然收起。所以要靠 `snippetLists` / `snippetRows` 两个 Map 记住 DOM 引用。

#### 间距

```css
/* 嵌套在分组里的每一行（标识符行，以及它下面的模板行）统一收紧上下留白。
   Obsidian 默认的 12px 在这个层级显得过松，两端对齐后也更像同一个整体。 */
.tips-snippet-group .setting-item {
	padding: 8px 0;
}
```

**注意选择器范围**：标识符行是 `details` 的**直接子元素**，模板行在 `.tips-snippet-entries` **里面**。用 `.tips-snippet-entries .setting-item` 只能命中后者，必须用 `.tips-snippet-group` 当祖先才能两处都覆盖。

---

### 9. 六语种 i18n

**文件**：`src/i18n.ts`

#### 自研方案

```ts
export function createTranslator(lang: Lang): Translate {
	// 返回 (key, vars) => string
}
```

文案表是一张扁平的 key → {zh, en, ru, fr, es, ar} 映射：

```ts
'setting.snippets.count': {
	zh: '共 {count} 条', en: '{count} in total',
	ru: 'всего {count}', fr: '{count} au total',
	es: '{count} en total', ar: 'الإجمالي {count}',
},
```

`{name}` 形式的占位符在运行时替换。

#### 语言解析

```ts
/** 依据设置解析当前界面语言并重建翻译函数。 */
applyLanguage(): void {
	this.lang = resolveLanguage(this.settings.language, getLanguage());
	this.t = createTranslator(this.lang);
}
```

`getLanguage()` 是 Obsidian 1.8.7 引入的公开 API（这就是 `minAppVersion` 定在 1.8.7 的原因）。设置里的 `language` 可以是 `'auto'`，此时跟随 Obsidian。

#### RTL

面板元素上设：

```ts
// 交给浏览器按内容判断书写方向，阿拉伯语等 RTL 语言才能正常排版
el.setAttribute('dir', 'auto');
```

用 `'auto'` 而不是 `'rtl'`：面板里可能混着英文标识符（`python`、`mermaid`）和阿拉伯语备注，交给浏览器按内容判断更准。

#### 语言名用各自写法

`简体中文 / English / Русский / Français / Español / العربية` —— 每种语言名都用自己的文字写，这样用户在任何界面语言下都能认出自己的语言。

---

## 四、踩过的坑

按主题归类。这些全部是实际踩到过的，做改动前值得扫一眼。

### 1. 显示层

| # | 现象 | 原因 | 解法 |
| --- | --- | --- | --- |
| 1.1 | 长文档里悬浮按钮出现在莫名其妙的位置 | 扫描窗口截断时起点落在代码块中间，起始围栏被切掉，结束围栏被误判成新的起始围栏 | 窗口起点向前最多回溯 200 行，对齐到最近的围栏行 |
| 1.2 | 鼠标还在代码块里，按钮却消失了 | `buildDecorations()` 重建 widget 时 DOM 被换掉，`is-visible` 类丢失 | 重建后先用现有状态套一次可见性，再 `requestAnimationFrame` 补一次（`scheduleHoverApply`） |
| 1.3 | 从上往下悬停到相邻代码块，按钮不出现 | `setHoverBlock` 里做了"值没变就跳过"的短路，但按钮是新建的，需要重新套类 | **不做短路**，每次都 `applyHoverState()` |
| 1.4 | 面板溢出屏幕底部，随后被推上去盖住光标 | 旧实现给高度设了下限（最少 140px），下方只剩几十像素时面板仍按 140px 撑开 | 先清 `max-height` 量真实高度 → 决定方向 → 用一个**不超过可用空间**的限高，且不再对 `top` 做位移修正 |
| 1.5 | 过滤后候选变少，面板和锚点之间裂开一道缝 | 上翻时固定了 `top`，内容变少面板往下长 | 上翻改用 `bottom` 固定底边，内容变少时向下收 |
| 1.6 | 面板明明还在，`offsetHeight` 却读到旧值 | 上一轮的 `max-height` 还压在元素上 | 量高度前先 `setCssProps({ '--tips-picker-max-height': 'none' })` 清掉 |

### 2. CodeMirror / 编辑器

| # | 现象 | 原因 | 解法 |
| --- | --- | --- | --- |
| 2.1 | 编辑器与插件一起失灵，只能重启 Obsidian | `ViewPlugin.update()` 里抛了异常，CodeMirror 的更新流程中断 | 整个 `update()` 用 `try/catch` 包住，出错时 `console.error` + `closePicker()`，绝不让异常逃出去 |
| 2.2 | 打开面板时报 `Reading the editor layout isn't allowed during an update` | `update()` 期间直接调 `coordsAtPos()` | 统一走 `view.requestMeasure({ read, write })`，交给 CodeMirror 安排到安全的测量阶段 |
| 2.3 | 模板面板一直停在首次出现的位置不跟随光标 | 重新定位时只挪了 `this.picker`，而模板面板是 `this.snippetPicker`，两套实例 | 定位必须作用于 **当前活跃** 的面板：`this.activePicker()?.reposition(anchor)` |
| 2.4 | 从面板选中候选后，面板立刻又弹回来 | 改写语言行本身就是一次"语言行的文档变更"，触发了 `suggestInInfoLine` 的自动弹出 | `suppressAutoOpen` 标志，所有插件自身引发的 dispatch 都包在 `try/finally` 里置位 |
| 2.5 | 设置变更后装饰没更新 | 在插件外部直接改写 `instance.decorations` 绕过了 CodeMirror 的更新流程 | 定义 `refreshDecorationsEffect`，通过 `view.dispatch({ effects })` 触发正规重建 |
| 2.6 | `RangeSetBuilder` 抛异常 | add 的位置没有按升序 | 循环里 `continue` 跳过视口之前的块、`break` 越过视口之后的块 |
| 2.7 | 点击按钮后光标跳到别处 | 默认行为让编辑器抢焦点 | `event.preventDefault()` + `stopPropagation()` |
| 2.8 | 点面板里的候选项，面板在选中瞬间就关了 | 关闭逻辑监听 `document` 的 `mousedown`，面板内部点击冒泡上去了 | 面板根元素上 `mousedown` → `stopPropagation()` |
| 2.9 | 点编辑器内部（比如代码正文）面板被立刻关掉 | `onDocumentMouseDown` 无差别关闭 | 若 `event.target` 在 `this.view.dom` 内就 `return`，交给光标逻辑判断 |
| 2.10 | 滚动笔记时面板与代码块脱节 | 面板是 `fixed` 定位，不随编辑器滚动 | `viewportChanged && !docChanged` 时 `closeAllPickers()` |

### 3. 数据与设置

| # | 现象 | 原因 | 解法 |
| --- | --- | --- | --- |
| 3.1 | 首次"添加条目"后插件状态异常 | `{ ...DEFAULT_SETTINGS, ...stored }` 在没有 `data.json` 时，`customEntries` 与模块级默认值**共用同一个数组**，`push` 污染了默认值 | `mergeSettings` 里显式 `customEntries: []`，之后再用 `normalizeCustomEntries()` 生成独立数组；`snippets` 同理 |
| 3.2 | 手工改坏的 `data.json` 导致行为异常 | 信任了磁盘上的值 | 逐项 `toBoolean()` 校验布尔值；`clampPickerWidth()` 限制宽度；`isLang()` 校验语言；`normalizeSnippets()` 清洗模板 |
| 3.3 | 用户在设置页展开的分组，改一条模板后自己收起了 | 增删模板时重建了整个设置页 | 局部刷新：`snippetLists` / `snippetRows` 两个 Map 记住 DOM 引用，只重画受影响的那一条 |
| 3.4 | 提示块和警告条样式逐渐不一致 | 复制了一份新类 | 用修饰类复用：`.tips-warning.is-info`，只覆盖 `border-left-color` |

### 4. 扫描与候选

| # | 现象 | 原因 | 解法 |
| --- | --- | --- | --- |
| 4.1 | **`tips.json` 的标识符在设置页显示了，但候选面板里选不到** | `buildCandidates()` 只收了 `scanned`，**没有 `bundled` 参数**。设置页走 `getSnippetGroups()`（改过了），面板走另一条路径（漏了） | `buildCandidates` 增加 `bundled` 参数并去重合并（v3.0.0 的"重大修复"） |
| 4.2 | 导入一份带 bundled 标识符的文件，那些模板被整段跳过 | `getKnownIdentifiers()` 没把 bundled 的标识符算进去，导入时判定为"当前没有这个条目" | 把 bundled 的标识符也加进 `known` |
| 4.3 | 排除 bundled 后，同一标识符在候选栏出现两次 | 扫描结果和 `tips.json` 内容重叠 | `seenPluginValues` 去重，优先保留扫描结果（它带 `enabled` 状态） |
| 4.4 | 关闭"读取附带模板"后候选还在变 | bundled 分支错误地判断了 `scanPlugins` | 两个开关独立：`scanPlugins` 管 `main.js`，`scanBundledSnippets` 管 `tips.json` |
| 4.5 | 变量式注册的插件永远扫不出来 | 名字运行时才确定，静态分析无解 | 这是**固有局限**，靠 `tips.json` 补救 + 设置页明确告知用户是哪几个插件 |

### 5. 围栏与替换范围

| # | 现象 | 原因 | 解法 |
| --- | --- | --- | --- |
| 5.1 | 刚敲下三个反引号没有响应 | 只收集了已闭合的代码块 | 未闭合的围栏也返回（`closed: false`），终点取 `doc.length` |
| 5.2 | 用户粘贴的代码里有一行 ` ``` ` 被误删 | 单边围栏也被当成包裹 | `stripFence` 要求**首尾都是围栏**才剥 |
| 5.3 | 插入模板后多一个空行 / 结束围栏被顶到文档末尾 | `contentTo` 的口径没搞清：已闭合时它是结束围栏那一行的**行首**，所以内容区末尾的换行也在替换范围内 | `body` 先 `replace(/\n+$/, '')`，已闭合时插入时补回一个 `\n` |
| 5.4 | `a ? b : c` 这类普通写法误触模板面板 | 触发条件太宽 | 收紧到"内容区**第一个字符**必须是 `?`，前面不允许空白" |

### 6. 工具函数

| # | 现象 | 原因 | 解法 |
| --- | --- | --- | --- |
| 6.1 | 清理 bundled 副本时，把不同代码块下的同名同内容条目误删了 | `snippetKey` 是 `name + body`，**不含标识符**。用一张全局指纹集合去比对，不同标识符下的同名条目会互相误伤 | 任何跨标识符的比对都必须**按标识符分组**，即 `Map<identifier, Set<key>>` |

> 6.1 是写这段文档时刚踩的：第一版 `removeBundledCopies` 用全局 `Set` 做指纹，测试里 `_integral/Polar curve` 被 `_graph/Polar curve` 误伤。这类 bug 靠肉眼看代码很难发现，**必须写测试**。

---

## 五、审核与发布

### 审核硬性要求（已踩过的）

| 规则 | 具体要求 |
| --- | --- |
| 禁止内联样式 | 不能用 `el.style.xxx = ...`；要用 CSS 类，或 `setCssProps()` 且**键名必须是 `--` 开头的 CSS 变量** |
| 禁止 `document.createElement` | 用全局 helper：`createDiv()` / `createSpan()` / `createEl()` |
| 禁止 `createEl('div')` / `createEl('span')` | 有专用 helper 就必须用专用：`createDiv()` / `createSpan()`。规则名 `obsidianmd/prefer-create-el`，只对 `div` 和 `span` 生效 |
| 设置页标题 | 不能用 `createEl('h3')`，要用 `Setting.setName().setHeading()` |
| 禁止 `localStorage` | 用 Obsidian 的 `getLanguage()` |
| README | 必须提供英文版（中文版放 `README_ZH.md`） |
| 公开 API | 不碰 `app.plugins` 这类内部对象 |

**注意**：`setDestructive()` 是 1.13.0 才有的 API，为了不让 `minAppVersion` 跟着抬到 1.13.0，删除按钮用的是 `setWarning()`。

### 发布流程

```bash
# 1. 改版本号（三处必须一致）
#    manifest.json / package.json / versions.json
#    或使用：npm version x.y.z   （会触发 version-bump.mjs）

# 2. 构建
npm run build

# 3. 提交 + 打 tag + 推送
git tag x.y.z
git push origin x.y.z

# 4. 在 GitHub 建 Release，附上 main.js / manifest.json / styles.css
```

首次提交审核通过后，后续版本**不需要重新提交审核**，打新 tag + 发 Release 即可被社区插件列表拉取。

### 构建产物体积参考

| 版本 | main.js |
| --- | --- |
| 2.1.1 | ≈ 108.7 KB |
| 3.0.0 | ≈ 110.2 KB（112,806 字节） |
| 3.1.0 | ≈ 114.7 KB（117,416 字节） |

### 本项目的测试习惯

没有引入测试框架。纯逻辑模块的验证方式是：

```bash
# 1. 用 esbuild 把纯模块打成 ESM
npx esbuild src/core/snippets.ts --bundle --format=esm --platform=node --outfile=__v-snip__.mjs

# 2. 写一个 .run.mjs 脚本 import 它并断言
node __v-clean__.run.mjs

# 3. 用完删掉临时文件
```

需要 `obsidian` 类型的模块（如 `scanner.ts`）要加 alias 指向一个 stub：

```bash
npx esbuild src/core/scanner.ts --bundle --format=esm --platform=node \
  --alias:obsidian=./__stub-obsidian__.mjs --outfile=__v-scan__.mjs
```

**验证完记得删干净**，`__*` 开头的临时文件不要留在仓库里。

---

## 六、附：关键常量速查

| 常量 | 值 | 位置 | 含义 |
| --- | --- | --- | --- |
| `FENCE_RE` | `/^ {0,3}(`{3,}\|~{3,})(.*)$/` | `editor/codeblocks.ts` | 围栏匹配 |
| `SCAN_WINDOW_LINES` | 3000 | `editor/codeblocks.ts` | 单次扫描最大行数 |
| `SCAN_LOOKBEHIND` | 200 | `editor/codeblocks.ts` | 窗口起点回溯行数 |
| `VIEWPORT_MARGIN` | 8 | `ui/position.ts` | 面板与视口边缘的最小间距 |
| `PICKER_ANCHOR_GAP` | 6 | `ui/position.ts` | 语言面板与锚点的间距 |
| `SNIPPET_ANCHOR_GAP` | `PICKER_ANCHOR_GAP + 15` | `ui/position.ts` | 模板面板与锚点的间距（更松） |
| `MAX_PANEL_HEIGHT` | 340 | `ui/position.ts` | 面板高度上限 |
| `BUNDLED_SNIPPET_FILE` | `'tips.json'` | `core/snippets.ts` | 附带模板文件名 |
| `PICKER_WIDTH_MIN` | 280 | `types.ts` | 面板宽度下限 |
| `PICKER_WIDTH_MAX` | 920 | `types.ts` | 面板宽度上限 |
| `PICKER_WIDTH_STEP` | 20 | `types.ts` | 宽度滑块的步进 |
| `BATCH_SIZE` | 6 | `core/scanner.ts` | 扫描插件时的并发批大小 |

### 默认设置（`DEFAULT_SETTINGS`，`src/types.ts`）

```ts
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
```

### 正则速查（`src/core/scanner.ts`）

| 常量 | 用途 |
| --- | --- |
| `PROCESSOR_RE` | 匹配 `registerMarkdownCodeBlockProcessor(...)` 调用 |
| `ASSIGNMENT_RE` | 匹配 `变量 = "字面量"` 赋值，用于常量还原 |
| `BLOCK_LANGUAGE_RE` | 匹配 `.block-language-xxx` 类名 |

**三个都是模块级 `g` 标志正则**，每次使用前必须 `lastIndex = 0`，否则第二次调用会从上次位置接着扫。
