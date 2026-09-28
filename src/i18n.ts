/**
 * 极简 i18n：内置中 / 英 / 俄 / 法 / 西 / 阿六种文案，默认简体中文，
 * 也可跟随 Obsidian 的界面语言。不引入任何第三方库。
 */

export type Lang = 'zh' | 'en' | 'ru' | 'fr' | 'es' | 'ar';

/** 界面语言下拉里可选的语言（语言名用它自己的写法，不随界面语言变化） */
export const LANGUAGE_OPTIONS: ReadonlyArray<{ value: Lang; label: string }> = [
	{ value: 'zh', label: '简体中文' },
	{ value: 'en', label: 'English' },
	{ value: 'ru', label: 'Русский' },
	{ value: 'fr', label: 'Français' },
	{ value: 'es', label: 'Español' },
	{ value: 'ar', label: 'العربية' },
];

/** 一段多语文案 */
export interface I18nText {
	zh: string;
	en: string;
	ru: string;
	fr: string;
	es: string;
	ar: string;
}

const STRINGS = {
	'button.label': {
		zh: '选择代码块语言', en: 'Choose code block language',
		ru: 'Выбрать язык блока кода', fr: 'Choisir le langage du bloc',
		es: 'Elegir el lenguaje del bloque', ar: 'اختيار لغة كتلة التعليمات',
	},
	'button.placeholder': {
		zh: '选择语言', en: 'Language',
		ru: 'Язык', fr: 'Langage',
		es: 'Lenguaje', ar: 'اللغة',
	},

	'panel.languages': {
		zh: '编程语言 / 内置处理器', en: 'Languages / built-in',
		ru: 'Языки / встроенные', fr: 'Langages / intégrés',
		es: 'Lenguajes / integrados', ar: 'اللغات / المدمجة',
	},
	'panel.plugins': {
		zh: '插件 / 自定义', en: 'Plugins / custom',
		ru: 'Плагины / свои', fr: 'Extensions / personnalisés',
		es: 'Complementos / personalizados', ar: 'الإضافات / المخصصة',
	},
	'panel.empty.languages': {
		zh: '无匹配语言', en: 'No matching language',
		ru: 'Нет подходящего языка', fr: 'Aucun langage correspondant',
		es: 'Ningún lenguaje coincidente', ar: 'لا توجد لغة مطابقة',
	},
	'panel.empty.plugins': {
		zh: '无匹配代码块', en: 'No matching block',
		ru: 'Нет подходящего блока', fr: 'Aucun bloc correspondant',
		es: 'Ningún bloque coincidente', ar: 'لا توجد كتلة مطابقة',
	},
	'panel.hint': {
		zh: '↑↓ 选择 · ←→ 切换栏 · Enter 确认 · Esc 关闭',
		en: '↑↓ select · ←→ switch column · Enter confirm · Esc close',
		ru: '↑↓ выбор · ←→ сменить столбец · Enter подтвердить · Esc закрыть',
		fr: '↑↓ sélectionner · ←→ changer de colonne · Entrée valider · Échap fermer',
		es: '↑↓ elegir · ←→ cambiar columna · Intro confirmar · Esc cerrar',
		ar: '↑↓ اختيار · ←→ تبديل العمود · Enter تأكيد · Esc إغلاق',
	},
	'panel.note.plugin': {
		zh: '插件：{name}', en: 'Plugin: {name}',
		ru: 'Плагин: {name}', fr: 'Extension : {name}',
		es: 'Complemento: {name}', ar: 'الإضافة: {name}',
	},
	'panel.note.disabled': {
		zh: '未启用', en: 'disabled',
		ru: 'отключён', fr: 'désactivé',
		es: 'desactivado', ar: 'معطّلة',
	},
	'panel.note.custom': {
		zh: '自定义', en: 'Custom',
		ru: 'Свой', fr: 'Personnalisé',
		es: 'Personalizado', ar: 'مخصص',
	},

	'setting.language': {
		zh: '界面语言🌏️', en: 'Interface language 🌏️',
		ru: 'Язык интерфейса 🌏️', fr: "Langue de l'interface 🌏️",
		es: 'Idioma de la interfaz 🌏️', ar: 'لغة الواجهة 🌏️',
	},
	'setting.language.desc': {
		zh: '默认简体中文，也可以切换成其它语言或跟随 Obsidian。',
		en: 'Simplified Chinese by default. Pick a language or follow Obsidian.',
		ru: 'По умолчанию упрощённый китайский. Выберите язык или следуйте Obsidian.',
		fr: 'Chinois simplifié par défaut. Choisissez une langue ou suivez Obsidian.',
		es: 'Chino simplificado por defecto. Elige un idioma o sigue a Obsidian.',
		ar: 'الصينية المبسطة افتراضيًا. اختر لغة أو اتبع Obsidian.',
	},
	'setting.language.auto': {
		zh: '跟随 Obsidian', en: 'Follow Obsidian',
		ru: 'Как в Obsidian', fr: 'Suivre Obsidian',
		es: 'Seguir a Obsidian', ar: 'اتباع Obsidian',
	},

	'setting.hoverButton': {
		zh: '代码块悬浮按钮', en: 'Floating code block button',
		ru: 'Плавающая кнопка на блоке', fr: 'Bouton flottant sur le bloc',
		es: 'Botón flotante en el bloque', ar: 'زر عائم على الكتلة',
	},
	'setting.hoverButton.desc': {
		zh: '鼠标悬浮在代码块上时，在右下角显示语言按钮。',
		en: 'Show a language button at the bottom-right corner of a code block on hover.',
		ru: 'Показывать кнопку выбора языка в правом нижнем углу блока при наведении.',
		fr: 'Afficher un bouton de langage en bas à droite du bloc au survol.',
		es: 'Mostrar un botón de lenguaje abajo a la derecha al pasar el cursor.',
		ar: 'إظهار زر اللغة في الزاوية السفلية اليمنى عند تمرير المؤشر.',
	},

	'setting.autoSuggest': {
		zh: '输入 ``` 后自动打开候选', en: 'Auto-open candidates after typing ```',
		ru: 'Открывать список после ввода ```', fr: 'Ouvrir la liste après avoir tapé ```',
		es: 'Abrir la lista tras escribir ```', ar: 'فتح القائمة بعد كتابة ```',
	},
	'setting.autoSuggest.desc': {
		zh: '在空行输入三个反引号后，自动打开双栏候选面板。',
		en: 'Open the two-column candidate panel right after three backticks are typed.',
		ru: 'Открывать двухколоночную панель сразу после ввода трёх обратных кавычек.',
		fr: 'Ouvrir le panneau à deux colonnes dès que trois accents graves sont saisis.',
		es: 'Abrir el panel de dos columnas justo después de escribir tres acentos graves.',
		ar: 'فتح اللوحة ذات العمودين فور كتابة ثلاث علامات اقتباس خلفية.',
	},

	'setting.suggestInInfoLine': {
		zh: '在语言行编辑时打开候选', en: 'Open candidates while editing the info line',
		ru: 'Открывать список при правке строки языка', fr: 'Ouvrir la liste en modifiant la ligne de langage',
		es: 'Abrir la lista al editar la línea de lenguaje', ar: 'فتح القائمة أثناء تحرير سطر اللغة',
	},
	'setting.suggestInInfoLine.desc': {
		zh: '把光标放到代码块的语言行（如 ```java）上，或在该行增删字符时，自动弹出候选面板。',
		en: 'Show the panel when the cursor sits on a code block info line (e.g. ```java) or while you edit that line.',
		ru: 'Показывать панель, когда курсор стоит на строке языка блока (например ```java) или при её правке.',
		fr: 'Afficher le panneau quand le curseur est sur la ligne de langage (ex. ```java) ou pendant sa modification.',
		es: 'Mostrar el panel cuando el cursor está en la línea de lenguaje (p. ej. ```java) o mientras la editas.',
		ar: 'إظهار اللوحة عندما يكون المؤشر على سطر لغة الكتلة (مثل ```java) أو أثناء تحريره.',
	},

	'setting.sortAlphabetically': {
		zh: '候选按字母排序', en: 'Sort candidates alphabetically',
		ru: 'Сортировать по алфавиту', fr: 'Trier par ordre alphabétique',
		es: 'Ordenar alfabéticamente', ar: 'الترتيب أبجديًا',
	},
	'setting.sortAlphabetically.desc': {
		zh: '关闭后，语言一栏按内置的常用度顺序排列。',
		en: 'When off, the language column keeps the built-in frequency order.',
		ru: 'Если выключено, языки идут в порядке встроенной частотности.',
		fr: "Désactivé, la colonne des langages garde l'ordre de fréquence intégré.",
		es: 'Si se desactiva, la columna de lenguajes mantiene el orden de frecuencia integrado.',
		ar: 'عند الإيقاف، يحتفظ عمود اللغات بترتيب الشيوع المدمج.',
	},

	'setting.scanBundled': {
		zh: '自动读取插件附带的模板', en: 'Read templates bundled with plugins',
		ru: 'Читать шаблоны, поставляемые с плагинами', fr: 'Lire les modèles fournis avec les extensions',
		es: 'Leer plantillas incluidas con los complementos', ar: 'قراءة القوالب المرفقة مع الإضافات',
	},
	'setting.scanBundled.desc': {
		zh: '自动扫描所有插件目录下的 tips.json，以自动添加提供的参考模板（只读不写；如果插件不带有 tips.json 则不会有任何操作）。',
		en: 'Automatically scan every plugin folder for a tips.json and add the reference templates it provides. Read-only; plugins that ship no tips.json cause no change.',
		ru: 'Автоматически искать tips.json в папках плагинов и добавлять его шаблоны. Только чтение; если файла нет, ничего не меняется.',
		fr: 'Rechercher automatiquement tips.json dans chaque extension et ajouter ses modèles. Lecture seule ; sans fichier, rien ne change.',
		es: 'Buscar automáticamente tips.json en cada complemento y añadir sus plantillas. Solo lectura; sin archivo no cambia nada.',
		ar: 'البحث تلقائيًا عن tips.json في كل إضافة وإضافة قوالبه. للقراءة فقط؛ إن لم يوجد الملف فلا يتغير شيء.',
	},

	'setting.scanPlugins': {
		zh: '扫描已安装插件的代码块名称', en: 'Scan installed plugins for code block names',
		ru: 'Искать названия блоков в установленных плагинах', fr: 'Rechercher les noms de blocs dans les extensions',
		es: 'Buscar nombres de bloques en los complementos', ar: 'البحث عن أسماء الكتل في الإضافات',
	},
	'setting.scanPlugins.desc': {
		zh: '读取插件目录下各插件的 main.js，提取 registerMarkdownCodeBlockProcessor 注册的名称。仅使用公开 API。',
		en: 'Read each plugin main.js under the plugins folder and extract names registered by registerMarkdownCodeBlockProcessor. Public API only.',
		ru: 'Читать main.js каждого плагина и извлекать имена, зарегистрированные через registerMarkdownCodeBlockProcessor. Только открытый API.',
		fr: 'Lire le main.js de chaque extension et extraire les noms enregistrés via registerMarkdownCodeBlockProcessor. API publique uniquement.',
		es: 'Leer el main.js de cada complemento y extraer los nombres registrados con registerMarkdownCodeBlockProcessor. Solo API pública.',
		ar: 'قراءة ملف main.js لكل إضافة واستخراج الأسماء المسجّلة عبر registerMarkdownCodeBlockProcessor. واجهات عامة فقط.',
	},

	'setting.includeBuiltin': {
		zh: '包含内置语言列表', en: 'Include the built-in language list',
		ru: 'Включить встроенный список языков', fr: 'Inclure la liste des langages intégrés',
		es: 'Incluir la lista de lenguajes integrados', ar: 'تضمين قائمة اللغات المدمجة',
	},
	'setting.includeBuiltin.desc': {
		zh: '包含常见编程语言与 Obsidian 内置处理器（mermaid、math、query）。',
		en: 'Include common programming languages plus Obsidian built-in processors (mermaid, math, query).',
		ru: 'Включить распространённые языки и встроенные обработчики Obsidian (mermaid, math, query).',
		fr: "Inclure les langages courants et les processeurs intégrés d'Obsidian (mermaid, math, query).",
		es: 'Incluir lenguajes comunes y los procesadores integrados de Obsidian (mermaid, math, query).',
		ar: 'تضمين اللغات الشائعة والمعالجات المدمجة في Obsidian (mermaid و math و query).',
	},

	'setting.custom': {
		zh: '自定义代码块条目', en: 'Custom code block entries',
		ru: 'Свои записи блоков кода', fr: 'Entrées de bloc personnalisées',
		es: 'Entradas de bloque personalizadas', ar: 'إدخالات الكتل المخصصة',
	},
	'setting.custom.desc': {
		zh: '为常用但未被自动扫描到的代码块名补充条目。',
		en: 'Add entries for code block names that are not detected automatically.',
		ru: 'Добавить записи для названий блоков, которые не найдены автоматически.',
		fr: 'Ajouter des entrées pour les noms de blocs non détectés automatiquement.',
		es: 'Añadir entradas para nombres de bloques no detectados automáticamente.',
		ar: 'إضافة إدخالات لأسماء الكتل غير المكتشفة تلقائيًا.',
	},
	'setting.custom.add': {
		zh: '添加条目', en: 'Add entry',
		ru: 'Добавить запись', fr: 'Ajouter une entrée',
		es: 'Añadir entrada', ar: 'إضافة إدخال',
	},
	'setting.custom.value': {
		zh: '条目', en: 'Entry',
		ru: 'Запись', fr: 'Entrée',
		es: 'Entrada', ar: 'إدخال',
	},
	'setting.custom.value.desc': {
		zh: '填写写进代码块的名字，例如 dataviewjs。',
		en: 'The name that goes into the code block, e.g. dataviewjs.',
		ru: 'Имя, которое попадёт в блок кода, например dataviewjs.',
		fr: 'Le nom écrit dans le bloc de code, par ex. dataviewjs.',
		es: 'El nombre que se escribe en el bloque, p. ej. dataviewjs.',
		ar: 'الاسم الذي يُكتب في الكتلة، مثل dataviewjs.',
	},
	'setting.custom.note': {
		zh: '备注', en: 'Note',
		ru: 'Примечание', fr: 'Note',
		es: 'Nota', ar: 'ملاحظة',
	},
	'setting.custom.note.desc': {
		zh: '显示在候选面板右侧的说明文字。',
		en: 'Shown on the right side of the candidate panel.',
		ru: 'Показывается справа в панели подсказок.',
		fr: 'Affiché à droite du panneau de suggestions.',
		es: 'Se muestra a la derecha del panel de sugerencias.',
		ar: 'يظهر في الجانب الأيمن من لوحة الاقتراحات.',
	},
	'setting.custom.remove': {
		zh: '删除', en: 'Remove',
		ru: 'Удалить', fr: 'Supprimer',
		es: 'Eliminar', ar: 'حذف',
	},
	'setting.custom.invalid': {
		zh: '条目不能为空，且不能包含空格、反引号或波浪号。',
		en: 'An entry must not be empty and cannot contain spaces, backticks or tildes.',
		ru: 'Запись не может быть пустой и не должна содержать пробелы, обратные кавычки или тильды.',
		fr: 'Une entrée ne peut être vide ni contenir espaces, accents graves ou tildes.',
		es: 'Una entrada no puede estar vacía ni contener espacios, acentos graves o virgulillas.',
		ar: 'لا يجوز أن يكون الإدخال فارغًا أو يحتوي مسافات أو علامات اقتباس خلفية أو مدّات.',
	},
	'setting.custom.duplicate': {
		zh: '该条目已存在于自定义列表中。', en: 'This entry already exists in the custom list.',
		ru: 'Такая запись уже есть в списке.', fr: 'Cette entrée existe déjà dans la liste.',
		es: 'Esta entrada ya existe en la lista.', ar: 'هذا الإدخال موجود بالفعل في القائمة.',
	},
	'setting.custom.empty': {
		zh: '暂无自定义条目。', en: 'No custom entries yet.',
		ru: 'Своих записей пока нет.', fr: 'Aucune entrée personnalisée.',
		es: 'Aún no hay entradas personalizadas.', ar: 'لا توجد إدخالات مخصصة بعد.',
	},
	'setting.custom.restartHint': {
		zh: '⚠️ 添加或修改条目后，建议重启一次 Obsidian 以确保生效。',
		en: '⚠️ After adding or editing entries, restart Obsidian to make sure they take effect.',
		ru: '⚠️ После добавления или изменения записей перезапустите Obsidian.',
		fr: '⚠️ Après avoir ajouté ou modifié des entrées, redémarrez Obsidian.',
		es: '⚠️ Tras añadir o editar entradas, reinicia Obsidian.',
		ar: '⚠️ بعد إضافة الإدخالات أو تعديلها، أعد تشغيل Obsidian.',
	},

	'setting.snippets': {
		zh: '内容模板', en: 'Content templates',
		ru: 'Шаблоны содержимого', fr: 'Modèles de contenu',
		es: 'Plantillas de contenido', ar: 'قوالب المحتوى',
	},
	// 拆成两段，中间的 ? 在界面上单独渲染为主题色加粗
	'setting.snippets.desc.before': {
		zh: '为代码块条目添加参考模板。在代码块内容的第一行输入 ',
		en: 'Add reference templates for code block entries. Type ',
		ru: 'Добавьте шаблоны для записей блоков кода. Введите ',
		fr: 'Ajoutez des modèles pour les entrées de bloc. Tapez ',
		es: 'Añade plantillas para las entradas de bloque. Escribe ',
		ar: 'أضف قوالب لمدخلات الكتل. اكتب ',
	},
	'setting.snippets.desc.after': {
		zh: ' 即可调出面板。',
		en: ' as the first character inside a block to bring up the panel.',
		ru: ' первым символом в блоке, чтобы открыть панель.',
		fr: ' comme premier caractère du bloc pour ouvrir le panneau.',
		es: ' como primer carácter del bloque para abrir el panel.',
		ar: ' كأول حرف داخل الكتلة لفتح اللوحة.',
	},
	'setting.snippets.customEmpty': {
		zh: '暂无自定义条目。在上方「自定义代码块条目」里添加后，就能在这里为它配置模板。',
		en: 'No custom entries yet. Add one under “Custom code block entries” above, then you can give it templates here.',
		ru: 'Своих записей пока нет. Добавьте её выше в «Свои записи блоков кода», затем задайте шаблоны здесь.',
		fr: 'Aucune entrée personnalisée. Ajoutez-en une ci-dessus, puis donnez-lui des modèles ici.',
		es: 'Aún no hay entradas personalizadas. Añade una arriba y luego asígnale plantillas aquí.',
		ar: 'لا توجد إدخالات مخصصة بعد. أضف واحدًا في الأعلى ثم امنحه قوالب هنا.',
	},
	'setting.snippets.empty': {
		zh: '暂无内容模板。', en: 'No templates yet.',
		ru: 'Шаблонов пока нет.', fr: 'Aucun modèle.',
		es: 'Aún no hay plantillas.', ar: 'لا توجد قوالب بعد.',
	},
	'setting.snippets.count': {
		zh: '共 {count} 条', en: '{count} in total',
		ru: 'всего {count}', fr: '{count} au total',
		es: '{count} en total', ar: 'الإجمالي {count}',
	},
	'setting.snippets.add': {
		zh: '添加模板', en: 'Add template',
		ru: 'Добавить шаблон', fr: 'Ajouter un modèle',
		es: 'Añadir plantilla', ar: 'إضافة قالب',
	},
	'setting.snippets.edit': {
		zh: '编辑', en: 'Edit',
		ru: 'Изменить', fr: 'Modifier',
		es: 'Editar', ar: 'تعديل',
	},
	'setting.snippets.remove': {
		zh: '删除', en: 'Remove',
		ru: 'Удалить', fr: 'Supprimer',
		es: 'Eliminar', ar: 'حذف',
	},
	'setting.snippets.transfer': {
		zh: '导入 / 导出', en: 'Import / export',
		ru: 'Импорт / экспорт', fr: 'Importer / exporter',
		es: 'Importar / exportar', ar: 'استيراد / تصدير',
	},
	'setting.snippets.builtin': {
		zh: '内置', en: 'Built-in',
		ru: 'Встроенные', fr: 'Intégrés',
		es: 'Integrados', ar: 'المدمجة',
	},
	'setting.snippets.customGroup': {
		zh: '自定义条目', en: 'Custom entries',
		ru: 'Свои записи', fr: 'Entrées personnalisées',
		es: 'Entradas personalizadas', ar: 'إدخالات مخصصة',
	},
	'setting.snippets.orphan': {
		zh: '其他条目(暂丢失条目)', en: 'Other entries (temporarily missing)',
		ru: 'Прочие записи (временно отсутствуют)', fr: 'Autres entrées (temporairement absentes)',
		es: 'Otras entradas (faltan temporalmente)', ar: 'إدخالات أخرى (مفقودة مؤقتًا)',
	},

	'modal.snippet.new': {
		zh: '新建内容模板', en: 'New template',
		ru: 'Новый шаблон', fr: 'Nouveau modèle',
		es: 'Nueva plantilla', ar: 'قالب جديد',
	},
	'modal.snippet.edit': {
		zh: '编辑内容模板', en: 'Edit template',
		ru: 'Изменить шаблон', fr: 'Modifier le modèle',
		es: 'Editar plantilla', ar: 'تعديل القالب',
	},
	'modal.snippet.name': {
		zh: '名称', en: 'Name',
		ru: 'Название', fr: 'Nom',
		es: 'Nombre', ar: 'الاسم',
	},
	'modal.snippet.body': {
		zh: '内容', en: 'Body',
		ru: 'Содержимое', fr: 'Contenu',
		es: 'Contenido', ar: 'المحتوى',
	},
	'modal.snippet.body.desc': {
		zh: '可以直接粘贴整段代码块，外层的 ``` 会被自动去掉。',
		en: 'Paste a whole code block if you like — the surrounding ``` is stripped automatically.',
		ru: 'Можно вставить целый блок кода — внешние ``` удалятся сами.',
		fr: 'Vous pouvez coller un bloc entier — les ``` autour sont retirés automatiquement.',
		es: 'Puedes pegar un bloque completo: los ``` externos se quitan solos.',
		ar: 'يمكنك لصق كتلة كاملة — ستُزال ``` المحيطة تلقائيًا.',
	},
	'modal.snippet.save': {
		zh: '保存', en: 'Save',
		ru: 'Сохранить', fr: 'Enregistrer',
		es: 'Guardar', ar: 'حفظ',
	},
	'modal.snippet.cancel': {
		zh: '取消', en: 'Cancel',
		ru: 'Отмена', fr: 'Annuler',
		es: 'Cancelar', ar: 'إلغاء',
	},
	'modal.snippet.delete': {
		zh: '删除', en: 'Delete',
		ru: 'Удалить', fr: 'Supprimer',
		es: 'Eliminar', ar: 'حذف',
	},
	'modal.snippet.nameRequired': {
		zh: '请填写名称。', en: 'Please enter a name.',
		ru: 'Введите название.', fr: 'Veuillez saisir un nom.',
		es: 'Introduce un nombre.', ar: 'يرجى إدخال اسم.',
	},
	'modal.snippet.bodyRequired': {
		zh: '请填写内容。', en: 'Please enter a body.',
		ru: 'Введите содержимое.', fr: 'Veuillez saisir un contenu.',
		es: 'Introduce un contenido.', ar: 'يرجى إدخال محتوى.',
	},
	'modal.snippet.duplicate': {
		zh: '已存在同名模板。', en: 'A template with this name already exists.',
		ru: 'Шаблон с таким названием уже есть.', fr: 'Un modèle portant ce nom existe déjà.',
		es: 'Ya existe una plantilla con ese nombre.', ar: 'يوجد قالب بهذا الاسم بالفعل.',
	},

	'modal.transfer.title': {
		zh: '导入 / 导出内容模板', en: 'Import / export templates',
		ru: 'Импорт / экспорт шаблонов', fr: 'Importer / exporter les modèles',
		es: 'Importar / exportar plantillas', ar: 'استيراد / تصدير القوالب',
	},
	'modal.transfer.export': {
		zh: '导出', en: 'Export',
		ru: 'Экспорт', fr: 'Exporter',
		es: 'Exportar', ar: 'تصدير',
	},
	'modal.transfer.export.desc': {
		zh: '复制下面的 JSON 分享给别人。',
		en: 'Copy the JSON below to share your templates.',
		ru: 'Скопируйте JSON ниже, чтобы поделиться шаблонами.',
		fr: 'Copiez le JSON ci-dessous pour partager vos modèles.',
		es: 'Copia el JSON de abajo para compartir tus plantillas.',
		ar: 'انسخ JSON أدناه لمشاركة قوالبك.',
	},
	'modal.transfer.copy': {
		zh: '复制到剪贴板', en: 'Copy to clipboard',
		ru: 'Копировать в буфер', fr: 'Copier dans le presse-papiers',
		es: 'Copiar al portapapeles', ar: 'نسخ إلى الحافظة',
	},
	'modal.transfer.copied': {
		zh: '已复制到剪贴板。', en: 'Copied to clipboard.',
		ru: 'Скопировано в буфер.', fr: 'Copié dans le presse-papiers.',
		es: 'Copiado al portapapeles.', ar: 'تم النسخ إلى الحافظة.',
	},
	'modal.transfer.exportFile': {
		zh: '导出 JSON 文件', en: 'Export JSON file',
		ru: 'Экспорт в файл JSON', fr: 'Exporter un fichier JSON',
		es: 'Exportar archivo JSON', ar: 'تصدير ملف JSON',
	},
	'modal.transfer.exported': {
		zh: '已导出 {name}', en: 'Exported {name}',
		ru: 'Экспортировано: {name}', fr: '{name} exporté',
		es: '{name} exportado', ar: 'تم تصدير {name}',
	},
	'modal.transfer.importFile': {
		zh: 'JSON 文件导入', en: 'Import JSON file',
		ru: 'Импорт из файла JSON', fr: 'Importer un fichier JSON',
		es: 'Importar archivo JSON', ar: 'استيراد ملف JSON',
	},
	'modal.transfer.includeCustom': {
		zh: '可导入非插件条目的模板（如：自定义）',
		en: 'Also import templates for non-plugin entries (e.g. custom)',
		ru: 'Также импортировать шаблоны своих записей',
		fr: 'Importer aussi les modèles des entrées non-plugin',
		es: 'Importar también plantillas de entradas no-plugin',
		ar: 'استيراد قوالب الإدخالات غير التابعة للإضافات أيضًا',
	},
	'modal.transfer.includeCustom.desc': {
		zh: '关闭后只导入插件注册条目的代码块模板，自定义条目的模板会被跳过。',
		en: 'When off, only templates for plugin-registered entries are imported; templates for custom entries are skipped.',
		ru: 'Если выключено, импортируются только шаблоны записей плагинов, свои пропускаются.',
		fr: "Désactivé, seuls les modèles des entrées d'extensions sont importés.",
		es: 'Si se desactiva, solo se importan las plantillas de entradas de complementos.',
		ar: 'عند الإيقاف، تُستورد قوالب إدخالات الإضافات فقط.',
	},
	'modal.transfer.skippedCustom': {
		zh: '已按设置跳过 {count} 条自定义模板。',
		en: 'Skipped {count} custom templates per your setting.',
		ru: 'Пропущено {count} своих шаблонов согласно настройке.',
		fr: '{count} modèles personnalisés ignorés selon votre réglage.',
		es: 'Se omitieron {count} plantillas personalizadas según tu ajuste.',
		ar: 'تم تخطي {count} من القوالب المخصصة وفقًا لإعدادك.',
	},
	'modal.transfer.createdCustom': {
		zh: '已自动补建 {count} 个自定义条目（备注留空）。',
		en: 'Created {count} custom entries automatically (note left blank).',
		ru: 'Автоматически создано своих записей: {count} (примечание пустое).',
		fr: '{count} entrées personnalisées créées automatiquement (note vide).',
		es: 'Se crearon {count} entradas personalizadas automáticamente (nota vacía).',
		ar: 'تم إنشاء {count} من الإدخالات المخصصة تلقائيًا (الملاحظة فارغة).',
	},
	'modal.transfer.import': {
		zh: '导入', en: 'Import',
		ru: 'Импорт', fr: 'Importer',
		es: 'Importar', ar: 'استيراد',
	},
	'modal.transfer.import.desc': {
		zh: '粘贴别人分享的 JSON（导入为追加，不会覆盖现有模板）',
		en: 'Paste JSON shared by someone else (import appends; existing templates are never overwritten)',
		ru: 'Вставьте JSON от другого пользователя (импорт добавляет, существующее не перезаписывается)',
		fr: "Collez un JSON partagé (l'import ajoute, rien n'est écrasé)",
		es: 'Pega un JSON compartido (la importación añade, nunca sobrescribe)',
		ar: 'الصق JSON شاركه شخص آخر (الاستيراد يضيف ولا يستبدل)',
	},
	'modal.transfer.import.button': {
		zh: '输入框导入', en: 'Import from box',
		ru: 'Импорт из поля', fr: 'Importer depuis le champ',
		es: 'Importar desde el cuadro', ar: 'استيراد من الحقل',
	},
	'modal.transfer.invalid': {
		zh: 'JSON 格式不正确：{message}', en: 'Invalid JSON: {message}',
		ru: 'Неверный JSON: {message}', fr: 'JSON invalide : {message}',
		es: 'JSON no válido: {message}', ar: 'JSON غير صالح: {message}',
	},
	'modal.transfer.done': {
		zh: '导入完成：新增 {added} 条，跳过重复 {duplicates} 条。',
		en: 'Imported {added}, skipped {duplicates} duplicates.',
		ru: 'Добавлено {added}, пропущено дублей {duplicates}.',
		fr: '{added} importés, {duplicates} doublons ignorés.',
		es: '{added} importados, {duplicates} duplicados omitidos.',
		ar: 'تم استيراد {added} وتخطي {duplicates} مكررًا.',
	},
	'modal.transfer.skipped': {
		zh: '已跳过当前不存在的条目：{list}',
		en: "Skipped entries that aren't available right now: {list}",
		ru: 'Пропущены недоступные сейчас записи: {list}',
		fr: 'Entrées indisponibles ignorées : {list}',
		es: 'Entradas no disponibles omitidas: {list}',
		ar: 'تم تخطي إدخالات غير متاحة حاليًا: {list}',
	},
	'modal.transfer.nothing': {
		zh: '没有可导入的内容。', en: 'Nothing to import.',
		ru: 'Нечего импортировать.', fr: 'Rien à importer.',
		es: 'Nada que importar.', ar: 'لا يوجد ما يمكن استيراده.',
	},

	'picker.snippet.title': {
		zh: '内容模板', en: 'Templates',
		ru: 'Шаблоны', fr: 'Modèles',
		es: 'Plantillas', ar: 'القوالب',
	},
	'picker.snippet.preview': {
		zh: '预览', en: 'Preview',
		ru: 'Просмотр', fr: 'Aperçu',
		es: 'Vista previa', ar: 'معاينة',
	},
	'picker.snippet.empty': {
		zh: '这个代码块还没有内容模板。', en: 'No templates for this code block.',
		ru: 'Для этого блока кода шаблонов нет.', fr: 'Aucun modèle pour ce bloc de code.',
		es: 'No hay plantillas para este bloque.', ar: 'لا توجد قوالب لهذه الكتلة.',
	},
	'picker.snippet.emptyHint': {
		zh: '可在「设置 → Tips → 内容模板」中添加。',
		en: 'Add one under Settings → Tips → Content templates.',
		ru: 'Добавьте в «Настройки → Tips → Шаблоны содержимого».',
		fr: 'Ajoutez-en dans Paramètres → Tips → Modèles de contenu.',
		es: 'Añade una en Ajustes → Tips → Plantillas de contenido.',
		ar: 'أضف واحدًا في الإعدادات ← Tips ← قوالب المحتوى.',
	},
	'picker.snippet.noMatch': {
		zh: '无匹配模板', en: 'No matching template',
		ru: 'Нет подходящего шаблона', fr: 'Aucun modèle correspondant',
		es: 'Ninguna plantilla coincidente', ar: 'لا يوجد قالب مطابق',
	},
	'picker.snippet.hint': {
		zh: '↑↓ 选择 · Enter 插入 · Esc 关闭',
		en: '↑↓ select · Enter insert · Esc close',
		ru: '↑↓ выбор · Enter вставить · Esc закрыть',
		fr: '↑↓ sélectionner · Entrée insérer · Échap fermer',
		es: '↑↓ elegir · Intro insertar · Esc cerrar',
		ar: '↑↓ اختيار · Enter إدراج · Esc إغلاق',
	},

	'setting.pickerWidth': {
		zh: '候选面板宽度', en: 'Candidate panel width',
		ru: 'Ширина панели подсказок', fr: 'Largeur du panneau de suggestions',
		es: 'Ancho del panel de sugerencias', ar: 'عرض لوحة الاقتراحات',
	},
	'setting.pickerWidth.desc': {
		zh: '单位像素，可调范围 {min}–{max}。',
		en: 'In pixels, adjustable from {min} to {max}.',
		ru: 'В пикселях, от {min} до {max}.',
		fr: 'En pixels, de {min} à {max}.',
		es: 'En píxeles, de {min} a {max}.',
		ar: 'بالبكسل، من {min} إلى {max}.',
	},

	'setting.rescan': {
		zh: '重新扫描', en: 'Rescan now',
		ru: 'Сканировать снова', fr: "Relancer l'analyse",
		es: 'Volver a escanear', ar: 'إعادة الفحص',
	},
	'setting.rescan.desc': {
		zh: '当前已收录 {count} 个代码块名称，来自 {plugins} 个插件。',
		en: 'Currently {count} code block names from {plugins} plugins.',
		ru: 'Сейчас {count} названий блоков из {plugins} плагинов.',
		fr: 'Actuellement {count} noms de blocs depuis {plugins} extensions.',
		es: 'Actualmente {count} nombres de bloques de {plugins} complementos.',
		ar: 'حاليًا {count} اسم كتلة من {plugins} إضافة.',
	},

	'command.open': {
		zh: '打开代码块语言选择器', en: 'Open code block language picker',
		ru: 'Открыть выбор языка блока кода', fr: 'Ouvrir le sélecteur de langage',
		es: 'Abrir el selector de lenguaje', ar: 'فتح منتقي لغة الكتلة',
	},
	'command.rescan': {
		zh: '重新扫描插件代码块名称', en: 'Rescan plugin code block names',
		ru: 'Заново просканировать названия блоков', fr: "Relancer l'analyse des noms de blocs",
		es: 'Reescanear nombres de bloques', ar: 'إعادة فحص أسماء الكتل',
	},

	'notice.scanning': {
		zh: '正在扫描已安装插件…', en: 'Scanning installed plugins…',
		ru: 'Сканирование установленных плагинов…', fr: 'Analyse des extensions installées…',
		es: 'Escaneando complementos instalados…', ar: 'جارٍ فحص الإضافات المثبّتة…',
	},
	'notice.scanDone': {
		zh: '扫描完成：{plugins} 个插件，共 {count} 个代码块条目。',
		en: 'Scan finished: {count} code block entries from {plugins} plugins.',
		ru: 'Готово: {count} записей блоков из {plugins} плагинов.',
		fr: 'Analyse terminée : {count} entrées depuis {plugins} extensions.',
		es: 'Análisis completado: {count} entradas de {plugins} complementos.',
		ar: 'انتهى الفحص: {count} إدخالًا من {plugins} إضافة.',
	},
	'notice.scanFailed': {
		zh: '扫描失败：{message}', en: 'Scan failed: {message}',
		ru: 'Ошибка сканирования: {message}', fr: "Échec de l'analyse : {message}",
		es: 'Error de escaneo: {message}', ar: 'فشل الفحص: {message}',
	},
	'notice.saveFailed': {
		zh: '保存设置失败：{message}', en: 'Failed to save settings: {message}',
		ru: 'Не удалось сохранить настройки: {message}', fr: "Échec de l'enregistrement : {message}",
		es: 'No se pudo guardar la configuración: {message}', ar: 'فشل حفظ الإعدادات: {message}',
	},
	'notice.noCodeBlock': {
		zh: '请先把光标放在代码块的语言行上。', en: 'Place the cursor on a code block info line first.',
		ru: 'Сначала поставьте курсор на строку языка блока.', fr: "Placez d'abord le curseur sur la ligne de langage d'un bloc.",
		es: 'Coloca primero el cursor en la línea de lenguaje de un bloque.', ar: 'ضع المؤشر أولًا على سطر لغة الكتلة.',
	},
	'notice.snippetSaved': {
		zh: '已保存模板：{name}', en: 'Template saved: {name}',
		ru: 'Шаблон сохранён: {name}', fr: 'Modèle enregistré : {name}',
		es: 'Plantilla guardada: {name}', ar: 'تم حفظ القالب: {name}',
	},
	'notice.snippetRemoved': {
		zh: '已删除模板：{name}', en: 'Template removed: {name}',
		ru: 'Шаблон удалён: {name}', fr: 'Modèle supprimé : {name}',
		es: 'Plantilla eliminada: {name}', ar: 'تم حذف القالب: {name}',
	},
	'notice.picked': {
		zh: '已设置代码块语言：{value}', en: 'Code block language set to: {value}',
		ru: 'Язык блока кода: {value}', fr: 'Langage du bloc défini : {value}',
		es: 'Lenguaje del bloque: {value}', ar: 'تم تعيين لغة الكتلة: {value}',
	},
} as const satisfies Record<string, I18nText>;

export type StringKey = keyof typeof STRINGS;

export type Translate = (key: StringKey, vars?: Record<string, string | number>) => string;

const SUPPORTED: readonly Lang[] = ['zh', 'en', 'ru', 'fr', 'es', 'ar'];

/** 判断一个值是不是受支持的语言代码（用于清洗设置里存的值） */
export function isLang(value: unknown): value is Lang {
	return typeof value === 'string' && (SUPPORTED as readonly string[]).includes(value);
}

function matchLanguage(tag: string): Lang | null {
	const code = tag.toLowerCase();
	for (const lang of SUPPORTED) {
		if (code === lang || code.startsWith(`${lang}-`) || code.startsWith(`${lang}_`)) return lang;
	}
	return null;
}

/**
 * 把语言标签映射到受支持的语言，认不出来就回退英文。
 *
 * 调用方传入 Obsidian `getLanguage()` 的结果，而不是在这里自己探测：
 * 一是官方推荐用该 API，二是本模块因此不依赖 obsidian 包，可以单独跑测试。
 */
export function detectLanguage(tag: string): Lang {
	return matchLanguage(tag) ?? 'en';
}

export function resolveLanguage(setting: 'auto' | Lang, tag: string): Lang {
	return setting === 'auto' ? detectLanguage(tag) : setting;
}

/** 生成一个翻译函数；`{name}` 形式的占位符会被 vars 替换。 */
export function createTranslator(lang: Lang): Translate {
	return (key, vars) => {
		const entry: I18nText = STRINGS[key];
		let text = entry[lang];
		if (vars) {
			for (const [name, value] of Object.entries(vars)) {
				text = text.split(`{${name}}`).join(String(value));
			}
		}
		return text;
	};
}

export function text(value: I18nText, lang: Lang): string {
	return value[lang];
}
