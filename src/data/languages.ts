import type { I18nText } from '../i18n';

/** 各语言一致的文案（语言名基本都是专有名词） */
const same = (value: string): I18nText => ({
	zh: value,
	en: value,
	ru: value,
	fr: value,
	es: value,
	ar: value,
});

export interface BuiltinLanguage {
	value: string;
	note: I18nText;
}

/** Obsidian 自带的代码块处理器（与第三方插件无关，设置页里也会单独列出） */
export const OBSIDIAN_PROCESSORS: BuiltinLanguage[] = [
	{
		value: 'mermaid',
		note: {
			zh: 'Mermaid 图表（含美人图）', en: 'Mermaid diagram',
			ru: 'Диаграмма Mermaid', fr: 'Diagramme Mermaid',
			es: 'Diagrama de Mermaid', ar: 'مخطط Mermaid',
		},
	},
	{
		value: 'math',
		note: {
			zh: '数学公式（LaTeX）', en: 'Math (LaTeX)',
			ru: 'Формулы (LaTeX)', fr: 'Mathématiques (LaTeX)',
			es: 'Matemáticas (LaTeX)', ar: 'رياضيات (LaTeX)',
		},
	},
	{
		value: 'query',
		note: {
			zh: 'Obsidian 搜索查询结果', en: 'Obsidian search query',
			ru: 'Поисковый запрос Obsidian', fr: 'Requête de recherche Obsidian',
			es: 'Consulta de búsqueda de Obsidian', ar: 'استعلام بحث Obsidian',
		},
	},
];

/**
 * 内置候选，按常用程度排序。
 * 前三项为 Obsidian 自带的代码块处理器，其余为常见语言标识。
 */
export const BUILTIN_LANGUAGES: BuiltinLanguage[] = [
	// —— Obsidian 内置处理器 ——
	...OBSIDIAN_PROCESSORS,

	// —— 脚本与终端 ——
	{ value: 'bash', note: same('Bash / Shell') },
	{ value: 'shell', note: same('Shell') },
	{ value: 'sh', note: same('POSIX Shell') },
	{ value: 'zsh', note: same('Zsh') },
	{ value: 'fish', note: same('Fish Shell') },
	{ value: 'powershell', note: same('PowerShell') },
	{ value: 'bat', note: same('Windows Batch') },
	{ value: 'cmd', note: same('Windows Command Prompt') },

	// —— JavaScript / TypeScript ——
	{ value: 'javascript', note: same('JavaScript') },
	{ value: 'js', note: same('JavaScript') },
	{ value: 'typescript', note: same('TypeScript') },
	{ value: 'ts', note: same('TypeScript') },
	{ value: 'jsx', note: same('JavaScript JSX') },
	{ value: 'tsx', note: same('TypeScript JSX') },
	{ value: 'vue', note: same('Vue SFC') },
	{ value: 'svelte', note: same('Svelte') },
	{ value: 'astro', note: same('Astro') },

	// —— 数据与配置 ——
	{ value: 'json', note: same('JSON') },
	{ value: 'json5', note: same('JSON5') },
	{ value: 'yaml', note: same('YAML') },
	{ value: 'yml', note: same('YAML') },
	{ value: 'toml', note: same('TOML') },
	{ value: 'ini', note: same('INI') },
	{ value: 'xml', note: same('XML') },
	{ value: 'properties', note: same('Java Properties') },
	{ value: 'env', note: same('Dotenv') },
	{ value: 'csv', note: same('CSV') },
	{ value: 'tsv', note: same('TSV') },

	// —— 标记与样式 ——
	{ value: 'html', note: same('HTML') },
	{ value: 'css', note: same('CSS') },
	{ value: 'scss', note: same('SCSS') },
	{ value: 'sass', note: same('Sass') },
	{ value: 'less', note: same('Less') },
	{ value: 'stylus', note: same('Stylus') },
	{ value: 'markdown', note: same('Markdown') },
	{ value: 'md', note: same('Markdown') },

	// —— 通用编程语言 ——
	{ value: 'python', note: same('Python') },
	{ value: 'java', note: same('Java') },
	{ value: 'kotlin', note: same('Kotlin') },
	{ value: 'scala', note: same('Scala') },
	{ value: 'groovy', note: same('Groovy') },
	{ value: 'c', note: same('C') },
	{ value: 'cpp', note: same('C++') },
	{ value: 'csharp', note: same('C#') },
	{ value: 'objc', note: same('Objective-C') },
	{ value: 'go', note: same('Go') },
	{ value: 'rust', note: same('Rust') },
	{ value: 'swift', note: same('Swift') },
	{ value: 'dart', note: same('Dart') },
	{ value: 'ruby', note: same('Ruby') },
	{ value: 'php', note: same('PHP') },
	{ value: 'lua', note: same('Lua') },
	{ value: 'perl', note: same('Perl') },
	{ value: 'r', note: same('R') },
	{ value: 'julia', note: same('Julia') },
	{ value: 'matlab', note: same('MATLAB') },
	{ value: 'haskell', note: same('Haskell') },
	{ value: 'elixir', note: same('Elixir') },
	{ value: 'erlang', note: same('Erlang') },
	{ value: 'clojure', note: same('Clojure') },
	{ value: 'lisp', note: same('Lisp') },
	{ value: 'scheme', note: same('Scheme') },
	{ value: 'ocaml', note: same('OCaml') },
	{ value: 'fsharp', note: same('F#') },
	{ value: 'vb', note: same('Visual Basic') },
	{ value: 'pascal', note: same('Pascal') },
	{ value: 'fortran', note: same('Fortran') },

	// —— 查询与格式 ——
	{ value: 'sql', note: same('SQL') },
	{ value: 'graphql', note: same('GraphQL') },
	{ value: 'http', note: same('HTTP') },
	{ value: 'regex', note: same('Regular Expression') },
	{ value: 'diff', note: same('Diff') },
	{ value: 'patch', note: same('Patch') },
	{ value: 'latex', note: same('LaTeX') },
	{ value: 'tex', note: same('TeX') },
	{ value: 'log', note: same('Log') },

	// —— 工程与运维 ——
	{ value: 'dockerfile', note: same('Dockerfile') },
	{ value: 'makefile', note: same('Makefile') },
	{ value: 'cmake', note: same('CMake') },
	{ value: 'nginx', note: same('Nginx') },
	{ value: 'apache', note: same('Apache') },
	{ value: 'gitignore', note: same('.gitignore') },

	// —— 硬件与图形 ——
	{ value: 'assembly', note: same('Assembly') },
	{ value: 'asm', note: same('Assembly') },
	{ value: 'verilog', note: same('Verilog') },
	{ value: 'vhdl', note: same('VHDL') },
	{ value: 'glsl', note: same('GLSL') },
	{ value: 'hlsl', note: same('HLSL') },
	{ value: 'shader', note: same('Shader') },
	{ value: 'solidity', note: same('Solidity') },
	{ value: 'wasm', note: same('WebAssembly') },
	{ value: 'wat', note: same('WebAssembly Text') },

	// —— 纯文本兜底 ——
	{ value: 'plaintext', note: same('Plain Text') },
	{ value: 'text', note: same('Plain Text') },
	{ value: 'txt', note: same('Plain Text') },
];
