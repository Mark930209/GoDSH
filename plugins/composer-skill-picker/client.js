/**
 * 项目技能选择器（composer-skill-picker）
 *
 * 在输入框工具行常驻一个短按钮，点开是一个浮层面板，用 2 个复选框控制列表：
 *   - 项目技能：`<项目根>/.agents/skills` 或 `<项目根>/.dsh/skills` 下的 SKILL.md
 *   - 全局技能：用户级（`<agentsHome>/skills`、`<dshHome>/skills`）与随包内置（bundled）
 *
 * 项目根 = 最近的含 `.git` 的祖先目录（没有则用会话 cwd），由 DSH 的 skill provider
 * 判定；这里只做路径归属判断，因为 `skills/list` 的结果条目**没有 source 字段**
 * （只有 path / name / description / whenToUse / modelInvocable）。
 *
 * 选中即把 `/技能名 ` 插入草稿（与内置 ui-skill 的 onPick 一致），发送时由宿主解析。
 */
window.__ModuleLoader__.load({
  id: '@local/composer-skill-picker',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // ---------------------------------------------------------------- constants
    /** 本插件拥有的 locale 命名空间。 */
    const NS = 'composer-skill-picker';
    /** 视为“项目技能”的目录标记（取标记之前的目录作为项目根）。 */
    const PROJECT_MARKERS = ['/.agents/skills/', '/.dsh/skills/'];
    /** 面板宽度（px）。 */
    const PANEL_WIDTH = 420;
    /** 下拉箭头。 */
    const CHEVRON = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\' fill=\'none\'%3E%3Cpath d=\'M3 4.5L6 7.5L9 4.5\' stroke=\'%2381858C\' stroke-width=\'1.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E")';

    // ---------------------------------------------------------------- locale
    /** 简体中文（key 集合的事实来源）。 */
    const zh = {
      'label': '技能',
      'title': '选择技能（项目 / 全局）',
      'project': '项目技能',
      'global': '全局技能',
      'loading': '加载中…',
      'error': '加载失败',
      'emptyProject': '当前项目没有技能',
      'emptyGlobal': '没有全局技能',
      'emptyPick': '至少勾选一类',
      'builtin': '内置',
      'user': '用户'
    };
    /** English mirror. */
    const en = {
      'label': 'Skills',
      'title': 'Pick a skill (project / global)',
      'project': 'Project',
      'global': 'Global',
      'loading': 'Loading…',
      'error': 'Load failed',
      'emptyProject': 'No skills in this project',
      'emptyGlobal': 'No global skills',
      'emptyPick': 'Select at least one group',
      'builtin': 'Built-in',
      'user': 'User'
    };

    // ---------------------------------------------------------------- styles
    const CSS = [
      '.cskp-trigger{display:inline-flex;align-items:center;gap:4px;height:28px;max-width:96px;',
      'padding:0 6px;border:none;border-radius:var(--dsw-radius-sm);background:transparent;',
      'color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;flex:none;}',
      '.cskp-trigger:hover,.cskp-trigger[data-open="true"]{background:var(--dsw-alias-interactive-bg-hover-solid);',
      'color:var(--dsw-alias-label-primary);}',
      '.cskp-trigger:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}',
      '.cskp-trigger-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}',
      '.cskp-chevron{width:12px;height:12px;flex:none;opacity:.75;background-image:' + CHEVRON + ';',
      'background-repeat:no-repeat;background-position:center;background-size:12px 12px;}',
      '.cskp-panel{position:fixed;z-index:90;display:flex;flex-direction:column;overflow:hidden;',
      'max-height:min(420px,60vh);background:var(--dsw-alias-bg-layer-1);',
      'border:1px solid var(--dsw-alias-border-l2);border-radius:8px;',
      'box-shadow:0 12px 32px rgba(0,0,0,.16),0 2px 8px rgba(0,0,0,.08);font-size:12px;}',
      '.cskp-filters{display:flex;flex-wrap:wrap;gap:10px;padding:8px 10px;',
      'border-bottom:1px solid var(--dsw-alias-border-l2);flex:none;}',
      '.cskp-check{display:inline-flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;',
      'color:var(--dsw-alias-label-secondary);user-select:none;}',
      '.cskp-check input{accent-color:var(--dsw-alias-brand-primary);margin:0;cursor:pointer;}',
      '.cskp-count{color:var(--dsw-alias-state-idle-primary);font-size:11px;}',
      '.cskp-list{overflow-y:auto;overscroll-behavior:contain;padding:4px;flex:1 1 auto;min-height:0;}',
      '.cskp-group{font-size:11px;font-weight:600;padding:6px 8px 2px;',
      'color:var(--dsw-alias-label-secondary);}',
      '.cskp-row{display:flex;flex-direction:column;gap:1px;width:100%;padding:5px 8px;border:none;',
      'border-radius:var(--dsw-radius-sm);background:transparent;text-align:left;cursor:pointer;font:inherit;}',
      '.cskp-row:hover{background:var(--dsw-alias-interactive-bg-hover-solid);}',
      '.cskp-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px;}',
      '.cskp-line{display:flex;align-items:center;gap:6px;min-width:0;}',
      '.cskp-name{flex:0 1 auto;min-width:0;font-size:12px;color:var(--dsw-alias-label-primary);',
      'white-space:nowrap;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;}',
      '.cskp-name::-webkit-scrollbar{height:0;}',
      '.cskp-meta{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;',
      'overflow:hidden;text-overflow:ellipsis;}',
      '.cskp-badge{flex:none;font-size:10px;line-height:14px;padding:0 4px;border-radius:4px;',
      'background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);}',
      '.cskp-empty{padding:10px;font-size:12px;color:var(--dsw-alias-label-secondary);}'
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
      const tag = document.createElement('style');
      tag.dataset.pluginCss = NS;
      tag.textContent = css;
      document.head.appendChild(tag);
      return () => tag.remove();
    }

    /** 路径规范化：正斜杠 + 小写 + 去尾斜杠。 */
    function normalizePath(value) {
      if (typeof value !== 'string' || value === '') return undefined;
      return value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    }

    /** 中文排序。 */
    function byName(left, right) {
      return String(left.name ?? left.id ?? '').localeCompare(String(right.name ?? right.id ?? ''));
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
      const t = locale.bind(NS);

      ctx.effect(() => insertCss(CSS), 'composer-skill-picker: stylesheet');
      ctx.effect(() => locale.register(NS, { zh, en }), 'composer-skill-picker: dictionaries');

      // ------------------------------------------------------------ shared store
      /** 模块级共享状态：触发器与浮层面板都订阅它。 */
      const state = {
        open: false,
        sessionId: undefined,
        rect: null,
        anchorEl: null,
        panelEl: null,
        filters: { project: true, global: false },
        catalog: [],
        cwd: undefined,
        skillsStatus: 'idle',
        skillsError: null,
        insertSkill: null
      };
      const listeners = new Set();
      function emit() {
        for (const listener of Array.from(listeners)) {
          try {
            listener();
          } catch {
            // 单个订阅者异常不影响其他订阅者。
          }
        }
      }
      function setState(patch) {
        Object.assign(state, patch);
        emit();
      }
      function subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }
      function close() {
        if (!state.open) return;
        setState({ open: false, panelEl: null, anchorEl: null });
      }

      /** 会话摘要（含 cwd）。 */
      function sessionSummary(sessionId) {
        try {
          return sessions.list?.getSnapshot?.()?.byId?.[sessionId];
        } catch {
          return undefined;
        }
      }

      /**
       * 判断技能是否属于当前项目：取 `.agents/skills` / `.dsh/skills` 之前的目录作为
       * 项目根，只有它等于 cwd 或是 cwd 的祖先才算项目技能。
       * 没有 path 的条目（bundled / runtime 提供的技能）无法证明属于项目 → 归为全局。
       * @param {object} skill - skills/list 条目。
       * @param {string | undefined} cwd - 规范化后的会话 cwd。
       * @returns {boolean} 是否属于当前项目。
       */
      function isProjectSkill(skill, cwd) {
        if (cwd === undefined) return false;
        const path = normalizePath(skill?.path);
        if (path === undefined) return false;
        for (const marker of PROJECT_MARKERS) {
          let at = path.indexOf(marker);
          while (at > 0) {
            const root = path.slice(0, at);
            if (cwd === root || cwd.startsWith(`${root}/`)) return true;
            at = path.indexOf(marker, at + 1);
          }
        }
        return false;
      }

      /** 是否随包内置（没有 path，或路径落在 app.asar 内）。 */
      function isBuiltinSkill(skill) {
        const path = normalizePath(skill?.path);
        return path === undefined || path.includes('/app.asar');
      }

      /** 拉取技能目录（不分类，分类在渲染时做）。 */
      async function fetchSkills(sessionId, signal) {
        if (sessions.subagentAddress(sessionId) !== undefined) {
          return { list: [], cwd: undefined };
        }
        if (sessions.binding(sessionId) === undefined) {
          throw new Error(`composer-skill-picker: session "${sessionId}" is not retained`);
        }
        return sessions.using(sessionId, { source: 'composerSkillPicker', signal }, async (reference) => {
          signal.throwIfAborted();
          const snapshot = reference.binding.session.getSnapshot();
          if (snapshot.openState !== 'open') {
            throw snapshot.openError ?? new Error(`composer-skill-picker: session "${sessionId}" is not open`);
          }
          const result = await skills.list({ sessionId }, signal);
          signal.throwIfAborted();
          if (!result.ok) {
            throw new Error(`skills/list failed: ${result.error.code}: ${result.error.message}`);
          }
          return {
            list: result.value.skills,
            cwd: normalizePath(sessionSummary(sessionId)?.cwd)
          };
        });
      }

      let skillsAbort;
      /** 加载会话可见的技能目录。 */
      async function loadSkills(sessionId) {
        if (typeof sessionId !== 'string' || sessionId === '') return;
        if (skillsAbort !== undefined) skillsAbort.abort();
        const abort = new AbortController();
        skillsAbort = abort;
        setState({ skillsStatus: 'loading', skillsError: null });
        try {
          const { list, cwd } = await fetchSkills(sessionId, abort.signal);
          if (abort.signal.aborted) return;
          setState({ catalog: list, cwd, skillsStatus: 'ready' });
        } catch (error) {
          if (abort.signal.aborted) return;
          setState({
            skillsStatus: 'error',
            skillsError: String((error && error.message) || error)
          });
        }
      }

      /** 把 `/名字 ` 插入草稿并交还输入焦点。 */
      function insertSkill(name) {
        const actions = state.insertSkill;
        if (actions === undefined || actions === null) return;
        try {
          const span = actions.captureInsertion();
          if (span === undefined || actions.insertText(`/${name} `, span) !== true) {
            const fresh = actions.captureInsertion();
            if (fresh !== undefined) actions.insertText(`/${name} `, fresh);
          }
        } finally {
          const sessionId = state.sessionId;
          close();
          try {
            const actx = sessions.scope(sessionId);
            if (actx !== undefined) ctx.get('conversation')?.input?.for?.(actx)?.focus?.();
          } catch {
            // 焦点回填是尽力而为。
          }
        }
      }

      /** 分组：项目 / 全局。 */
      function classify() {
        const project = [];
        const global = [];
        for (const skill of state.catalog) {
          if (isProjectSkill(skill, state.cwd)) project.push(skill);
          else global.push(skill);
        }
        project.sort(byName);
        global.sort(byName);
        return { project, global };
      }

      // ------------------------------------------------------------ views
      /** 复选框。 */
      function filterCheck(key, label, count) {
        return h('label', { key: `f:${key}`, className: 'cskp-check' }, [
          h('input', {
            type: 'checkbox',
            checked: state.filters[key] === true,
            onChange: () => {
              const filters = Object.assign({}, state.filters, { [key]: state.filters[key] !== true });
              setState({ filters });
            }
          }),
          h('span', null, label),
          h('span', { className: 'cskp-count' }, String(count))
        ]);
      }

      /** 技能行。 */
      function skillRow(skill, withBadge) {
        const tone = isBuiltinSkill(skill) ? t('builtin') : t('user');
        return h('button', {
          key: `s:${skill.name}`,
          type: 'button',
          className: 'cskp-row',
          title: skill.whenToUse ?? skill.description ?? skill.name,
          onClick: () => insertSkill(skill.name)
        }, [
          h('span', { key: 'line', className: 'cskp-line' }, [
            h('span', { key: 'name', className: 'cskp-name' }, skill.name),
            withBadge
              ? h('span', { key: 'badge', className: 'cskp-badge' }, tone)
              : null
          ]),
          skill.description !== undefined && skill.description !== ''
            ? h('span', { key: 'meta', className: 'cskp-meta' }, skill.description)
            : null
        ]);
      }

      /** 浮层面板。 */
      function SkillPanel() {
        const [, force] = React.useState(0);
        React.useEffect(() => subscribe(() => force((value) => value + 1)), []);

        const open = state.open;
        React.useEffect(() => {
          if (!open) return undefined;
          const onKeyDown = (event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              close();
            }
          };
          const onPointerDown = (event) => {
            const target = event.target;
            if (state.panelEl !== null && state.panelEl.contains(target)) return;
            if (state.anchorEl !== null && state.anchorEl.contains(target)) return;
            close();
          };
          const onViewportChange = () => close();
          document.addEventListener('keydown', onKeyDown, true);
          document.addEventListener('pointerdown', onPointerDown, true);
          window.addEventListener('resize', onViewportChange);
          return () => {
            document.removeEventListener('keydown', onKeyDown, true);
            document.removeEventListener('pointerdown', onPointerDown, true);
            window.removeEventListener('resize', onViewportChange);
          };
        }, [open]);

        if (!open || state.rect === null) return null;

        const width = Math.min(PANEL_WIDTH, window.innerWidth - 24);
        const left = Math.max(8, Math.min(state.rect.left, window.innerWidth - width - 12));
        const bottom = Math.max(8, window.innerHeight - state.rect.top + 8);
        const style = { left: `${left}px`, bottom: `${bottom}px`, width: `${width}px` };

        const { project, global } = classify();
        const filters = state.filters;

        const body = [];
        if (!filters.project && !filters.global) {
          body.push(h('div', { key: 'pick', className: 'cskp-empty' }, t('emptyPick')));
        }
        if (filters.project) {
          body.push(h('div', { key: 'p:title', className: 'cskp-group' }, t('project')));
          if (state.skillsStatus === 'loading' || state.skillsStatus === 'idle') {
            body.push(h('div', { key: 'p:loading', className: 'cskp-empty' }, t('loading')));
          } else if (state.skillsStatus === 'error') {
            body.push(h('div', { key: 'p:error', className: 'cskp-empty' }, `${t('error')}: ${state.skillsError ?? ''}`));
          } else if (project.length === 0) {
            body.push(h('div', { key: 'p:empty', className: 'cskp-empty' }, t('emptyProject')));
          } else {
            body.push(...project.map((skill) => skillRow(skill, false)));
          }
        }
        if (filters.global) {
          body.push(h('div', { key: 'g:title', className: 'cskp-group' }, t('global')));
          if (state.skillsStatus === 'loading' || state.skillsStatus === 'idle') {
            body.push(h('div', { key: 'g:loading', className: 'cskp-empty' }, t('loading')));
          } else if (state.skillsStatus === 'error') {
            body.push(h('div', { key: 'g:error', className: 'cskp-empty' }, `${t('error')}: ${state.skillsError ?? ''}`));
          } else if (global.length === 0) {
            body.push(h('div', { key: 'g:empty', className: 'cskp-empty' }, t('emptyGlobal')));
          } else {
            body.push(...global.map((skill) => skillRow(skill, true)));
          }
        }

        return h('div', {
          className: 'cskp-panel',
          style,
          ref: (element) => {
            state.panelEl = element;
          }
        }, [
          h('div', { key: 'filters', className: 'cskp-filters' }, [
            filterCheck('project', t('project'), project.length),
            filterCheck('global', t('global'), global.length)
          ]),
          h('div', { key: 'list', className: 'cskp-list' }, body)
        ]);
      }

      /** 工具行里的短按钮。 */
      function SkillTrigger(props) {
        const [, force] = React.useState(0);
        React.useEffect(() => subscribe(() => force((value) => value + 1)), []);

        const sessionId = props.sessionId;
        const actions = props.inputActions;

        React.useEffect(() => {
          state.insertSkill = actions === undefined || actions === null ? null : actions;
          return () => {
            state.insertSkill = null;
          };
        }, [actions]);

        React.useEffect(() => {
          if (sessionId === state.sessionId) return;
          close();
          setState({
            sessionId,
            catalog: [],
            cwd: undefined,
            skillsStatus: 'idle'
          });
          loadSkills(sessionId);
        }, [sessionId]);

        const onClick = (event) => {
          if (state.open) {
            close();
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          setState({
            open: true,
            rect: { left: rect.left, top: rect.top },
            anchorEl: event.currentTarget,
            sessionId
          });
          if (state.skillsStatus === 'idle' || state.skillsStatus === 'error') loadSkills(sessionId);
        };

        return h('button', {
          type: 'button',
          className: 'cskp-trigger',
          'data-open': state.open ? 'true' : 'false',
          title: t('title'),
          'aria-label': t('title'),
          'aria-haspopup': 'dialog',
          'aria-expanded': state.open ? 'true' : 'false',
          onClick
        }, [
          h('span', { key: 'label', className: 'cskp-trigger-label' }, t('label')),
          h('span', { key: 'chevron', className: 'cskp-chevron' })
        ]);
      }

      // 触发器在工具行（`+` 之后）；面板挂在 frame 级浮层，避免被输入框容器裁剪。
      ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
        name: 'conversation.input.left',
        id: 'composer-skill-picker',
        order: 80
      }, SkillTrigger));
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'composer-skill-picker-panel',
        order: 900
      }, SkillPanel));
    }

    return { inject: ['slots', 'locale', 'sessions', 'remote', 'remote.skills'], apply };
  }
});
