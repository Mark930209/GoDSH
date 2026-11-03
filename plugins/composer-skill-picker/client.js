/**
 * 项目技能选择器（composer-skill-picker）
 *
 * 在输入框工具行常驻一个下拉框，自动发现**当前项目**的自定义技能：
 *   - `<项目根>/.dsh/skills/<名字>/SKILL.md`    → source: project-dsh
 *   - `<项目根>/.agents/skills/<名字>/SKILL.md` → source: project-agents
 *
 * 项目根 = 最近的含 `.git` 的祖先目录（没有则用会话 cwd），由 DSH 的 skill
 * provider 判定；下拉项在会话打开时自动加载，无需手动维护清单。
 * 选中后把 `/技能名 ` 插入草稿（与内置 ui-skill 的 onPick 一致），发送时由宿主
 * 按 skill 解析；不提交消息、不打开全局 `/` 菜单。
 */
window.__ModuleLoader__.load({
  id: '@local/composer-skill-picker',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // ---------------------------------------------------------------- constants
    /** 本插件拥有的 locale 命名空间。 */
    const NS = 'composer-skill-picker';
    /** 视为“当前项目自定义技能”的 SkillSource。 */
    const PROJECT_SOURCES = new Set(['project-dsh', 'project-agents']);
    /** 样式元素去重标记。 */
    const CSS_TAG = '@local/composer-skill-picker';
    /** 下拉箭头（与内置模型选择器同一枚 chevron）。 */
    const CHEVRON = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\' fill=\'none\'%3E%3Cpath d=\'M3 4.5L6 7.5L9 4.5\' stroke=\'%2381858C\' stroke-width=\'1.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E")';

    // ---------------------------------------------------------------- locale
    /** 简体中文（key 集合的事实来源）。 */
    const zh = {
      'label': '技能',
      'title': '选择当前项目的自定义技能（.dsh/skills / .agents/skills）',
      'loading': '技能加载中…',
      'empty': '当前项目没有技能',
      'error': '技能加载失败'
    };
    /** English mirror. */
    const en = {
      'label': 'Skills',
      'title': 'Pick a skill of the current project (.dsh/skills / .agents/skills)',
      'loading': 'Loading skills…',
      'empty': 'No skills in this project',
      'error': 'Could not load skills'
    };

    // ---------------------------------------------------------------- styles
    const CSS = [
      '.cskp-select{border-radius:var(--dsw-radius-sm);max-width:200px;height:28px;',
      'color:var(--dsw-alias-label-secondary);white-space:nowrap;cursor:pointer;',
      'appearance:none;background-color:transparent;background-image:' + CHEVRON + ';',
      'background-position:right 4px center;background-repeat:no-repeat;background-size:12px 12px;',
      'border:none;padding:0 20px 0 8px;font:inherit;font-size:12px;text-overflow:ellipsis;flex:none;}',
      '.cskp-select:hover:not(:disabled){background-color:var(--dsw-alias-interactive-bg-hover-solid);',
      'color:var(--dsw-alias-label-primary);}',
      '.cskp-select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}',
      '.cskp-select:disabled{opacity:.55;cursor:default;}',
      '.cskp-select option{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);}'
    ].join('');

    /**
     * 插入插件样式表，优先使用 Client 的 `styles` 内建；不可用时退回 `<style>` 标签。
     * @param {string} css - 样式文本。
     * @returns {() => void} 清理函数。
     */
    function insertCss(css) {
      if (typeof styles !== 'undefined' && styles && typeof styles.insert === 'function') {
        return styles.insert(css);
      }
      const existing = document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_TAG) + ']');
      if (existing !== null) return () => {};
      const tag = document.createElement('style');
      tag.dataset.plugin = '@local/composer-skill-picker';
      tag.dataset.pluginCss = CSS_TAG;
      tag.textContent = css;
      document.head.appendChild(tag);
      return () => tag.remove();
    }

    // ---------------------------------------------------------------- client body
    /**
     * Client 插件主体。
     * @param {object} ctx - Client 根上下文。
     */
    function apply(ctx) {
      const locale = ctx.locale;
      const sessions = ctx.sessions;
      const skills = ctx.remote.skills;
      const t = (key) => locale.bind(NS)(key);

      ctx.effect(() => insertCss(CSS), 'composer-skill-picker: stylesheet');
      ctx.effect(() => locale.register(NS, { zh, en }), 'composer-skill-picker: dictionaries');

      /**
       * 拉取当前项目的自定义技能（project-dsh / project-agents）。
       * 与内置 ui-skill 相同：要求会话已被保留且历史已打开，用临时引用持住会话
       * 直到 RPC 结束，避免会话在请求途中被回收。
       * @param {string} sessionId - 会话 id。
       * @param {AbortSignal} signal - 取消信号（组件卸载 / 会话切换时中止）。
       * @returns {Promise<Array<object>>} 过滤后的技能摘要。
       */
      async function listProjectSkills(sessionId, signal) {
        // 子代理会话没有可选的技能目录，返回空列表而不是报错。
        if (sessions.subagentAddress(sessionId) !== undefined) return [];
        if (sessions.binding(sessionId) === undefined) {
          throw new Error(`composer-skill-picker: session "${sessionId}" is not retained`);
        }
        return sessions.using(sessionId, { source: 'projectSkillCatalog', signal }, async (reference) => {
          signal.throwIfAborted();
          const state = reference.binding.session.getSnapshot();
          if (state.openState !== 'open') {
            throw state.openError ?? new Error(`composer-skill-picker: session "${sessionId}" is not open`);
          }
          const result = await skills.list({ sessionId }, signal);
          signal.throwIfAborted();
          if (!result.ok) {
            throw new Error(`skills/list failed: ${result.error.code}: ${result.error.message}`);
          }
          return result.value.skills.filter((skill) => PROJECT_SOURCES.has(skill.source));
        });
      }

      /**
       * 常驻下拉框：会话打开后自动加载项目技能，选中即插入 `/名字 `。
       * @param {object} props - 标准插槽 props（sessionId、inputActions）。
       */
      function SkillSelect(props) {
        const sessionId = props.sessionId;
        const actions = props.inputActions;
        const [items, setItems] = React.useState([]);
        const [status, setStatus] = React.useState('loading');

        // 会话变化时重新发现项目技能；卸载/切换时中止在途请求。
        React.useEffect(() => {
          if (typeof sessionId !== 'string' || sessionId === '') return undefined;
          let live = true;
          const abort = new AbortController();
          setItems([]);
          setStatus('loading');
          listProjectSkills(sessionId, abort.signal).then((list) => {
            if (!live) return;
            setItems(list.slice().sort((left, right) => left.name.localeCompare(right.name)));
            setStatus('ready');
          }, () => {
            if (live) setStatus('error');
          });
          return () => {
            live = false;
            abort.abort();
          };
        }, [sessionId]);

        const placeholder = status === 'loading'
          ? t('loading')
          : status === 'error'
            ? t('error')
            : items.length === 0 ? t('empty') : t('label');
        const disabled = status !== 'ready' || items.length === 0 || actions === undefined;

        /**
         * 选中一个技能：把 `/名字 ` 写回草稿并交还输入焦点。
         * @param {object} event - 原生 change 事件。
         */
        const onChange = (event) => {
          const name = event.target.value;
          if (name === '' || actions === undefined) return;
          const span = actions.captureInsertion();
          if (span === undefined || actions.insertText(`/${name} `, span) !== true) {
            const fresh = actions.captureInsertion();
            if (fresh !== undefined) actions.insertText(`/${name} `, fresh);
          }
          // 选择器拿到焦点后交还输入框，用户可继续打字。
          try {
            const actx = sessions.scope(sessionId);
            if (actx !== undefined) ctx.get('conversation')?.input?.for?.(actx)?.focus?.();
          } catch {
            // 焦点回填是尽力而为，失败不影响插入。
          }
        };

        return h('select', {
          className: 'cskp-select',
          title: t('title'),
          'aria-label': t('title'),
          value: '',
          disabled,
          onChange
        }, [
          h('option', { key: 'placeholder', value: '', disabled: true }, placeholder),
          ...items.map((skill) => h('option', {
            key: skill.name,
            value: skill.name,
            title: skill.description
          }, skill.name))
        ]);
      }

      // 注册到工具行（`+` 之后）。order 80 让下拉框排在 file-tree-context-menu 的
      // 隐形 bridge（90）之前，保持靠左。
      ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
        name: 'conversation.input.left',
        id: 'composer-skill-picker',
        order: 80
      }, SkillSelect));
    }

    return { inject: ['slots', 'locale', 'sessions', 'remote', 'remote.skills'], apply };
  }
});
