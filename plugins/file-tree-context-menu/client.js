/**
 * File-tree context menu for the DeepSeek Harness Web UI.
 *
 * Right-clicking a row of the workspace file tree (the `files` right-sidebar tab
 * owned by @deepseek-ai/dsh-client-ui-sidebar-files) — or a delivered-file card /
 * changed-files card / review file selector owned by
 * @deepseek-ai/dsh-client-ui-deliverables — opens a small menu that can:
 *   - add the file/folder to the conversation composer as a reference chip,
 *   - copy the @-mention form,
 *   - copy the absolute host path,
 *   - copy the workspace-relative path.
 *
 * Row identity is read from the owners' own stable markers:
 * file-tree rows use `li[data-files-entry][data-files-path]` under
 * `[data-files-root]`; deliverable surfaces use `[data-presented-file]` (cover
 * button `title` = resolved path), `div[data-changed-files]` (hidden
 * `aria-describedby` span = resolved path) and `[data-review-file]` (raw path
 * attribute). The composer insert prefers the session-scope
 * `slash/input-insert-reference` event (real ReferenceChipNode, via
 * `sessions.scope(id).bail(...)` with a CAS span from the public InputActions
 * `captureInsertion`), falling back to plain `insertText` with the same span.
 * Mention text mirrors the composer file intake's `formatFileMention` grammar
 * (workspace-relative, trailing `/` for folders, quoted on whitespace).
 */
window.__ModuleLoader__.load({
  id: '@local/file-tree-context-menu',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // ---------------------------------------------------------------- locale
    /** Dictionary namespace owned by this plugin. */
    const NS = 'file-tree-context-menu';
    /** Simplified Chinese dictionary (key-set source of truth). */
    const zh = {
      'menu.label': '文件操作',
      'menu.add': '加入对话',
      'menu.copyMention': '复制 @ 引用',
      'menu.copyAbsolute': '复制绝对路径',
      'menu.copyRelative': '复制相对路径',
      'status.copied': '已复制',
      'status.addedText': '已插入文本（非芯片）',
      'status.failed': '操作失败'
    };
    /** English dictionary, key-identical to the Chinese source of truth. */
    const en = {
      'menu.label': 'File actions',
      'menu.add': 'Add to conversation',
      'menu.copyMention': 'Copy @-mention',
      'menu.copyAbsolute': 'Copy absolute path',
      'menu.copyRelative': 'Copy relative path',
      'status.copied': 'Copied',
      'status.addedText': 'Inserted as text (no chip)',
      'status.failed': 'Action failed'
    };

    // ------------------------------------------------------------------ css
    const CSS_TAG_ID = '@local/file-tree-context-menu/style';
    const CSS = [
      '.ftcm-panel{position:fixed;z-index:100000;min-width:196px;padding:4px;',
      'box-sizing:border-box;border-radius:8px;background:var(--dsw-alias-bg-overlay);',
      'border:1px solid var(--dsw-alias-border-l2);box-shadow:0 8px 28px rgba(0,0,0,.22);',
      'font-family:var(--dsw-font-family,sans-serif);font-size:13px;}',
      '.ftcm-item{display:flex;align-items:center;width:100%;height:28px;padding:0 10px;',
      'border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);',
      'font:inherit;text-align:left;cursor:pointer;white-space:nowrap;}',
      '.ftcm-item:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.ftcm-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px;}',
      '.ftcm-item[data-state="copied"]{color:var(--dsw-alias-state-success-primary);}',
      '.ftcm-item[data-state="failed"]{color:var(--dsw-alias-state-error-primary);}',
      '.ftcm-sep{height:1px;margin:4px 6px;background:var(--dsw-alias-border-l1);}'
    ].join('');

    /** Insert the plugin stylesheet, preferring the Client `styles` builtin. */
    function insertCss(css) {
      if (typeof styles !== 'undefined' && styles && typeof styles.insert === 'function') {
        return styles.insert(css);
      }
      const existing = document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_TAG_ID) + ']');
      if (existing !== null) return () => {};
      const tag = document.createElement('style');
      tag.dataset.plugin = '@local/file-tree-context-menu';
      tag.dataset.pluginCss = CSS_TAG_ID;
      tag.textContent = css;
      document.head.appendChild(tag);
      return () => tag.remove();
    }

    // ------------------------------------------------------- module state
    /** Immutable UI state: the open menu plus per-item feedback. */
    let state = { menu: null, feedback: null };
    /** Latest composer InputActions captured from the standard provide channel. */
    let inputActions = null;
    /** Latest session id and cwd captured from the standard slot props. */
    let sessionId = null;
    let sessionCwd = null;
    /** Client plugin context, kept for `ctx.get('sessions')` lookups. */
    let pluginCtx = null;
    const listeners = new Set();

    function publish() {
      for (const listener of listeners) listener();
    }
    function subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
    function snapshot() {
      return state;
    }
    function openMenu(next) {
      state = { menu: next, feedback: null };
      publish();
    }
    function closeMenu() {
      if (state.menu === null) return;
      state = { menu: null, feedback: null };
      publish();
    }
    function showFeedback(key, ok, textKey) {
      if (state.menu === null) return;
      state = { menu: state.menu, feedback: { key, ok, textKey } };
      publish();
    }

    // ------------------------------------------------------------- paths
    function toSlashes(value) {
      return value.replace(/\\/g, '/');
    }
    /** Workspace-relative path with `/` separators, or '' for the root itself. */
    function relativeOf(root, path) {
      const base = toSlashes(root).replace(/\/+$/, '');
      const full = toSlashes(path).replace(/\/+$/, '');
      if (full === base) return '';
      const prefix = base + '/';
      if (full.startsWith(prefix)) return full.slice(prefix.length);
      if (full.toLowerCase().startsWith(prefix.toLowerCase())) return full.slice(prefix.length);
      return full;
    }
    /** Absolute host path in the platform's native separator style. */
    function nativeAbsolute(root, path) {
      const rel = relativeOf(root, path);
      if (rel === '') return root;
      const windows = /^[A-Za-z]:/.test(root) || root.startsWith('\\\\');
      const sep = windows ? '\\' : '/';
      return root.replace(/[\\/]+$/, '') + sep + rel.split('/').join(sep);
    }
    /**
     * The `@path` mention text, mirroring the composer file intake's
     * `formatFileMention` grammar: workspace-relative, a trailing `/` for
     * folders, quoted as a whole when it contains whitespace.
     * @returns the mention, or undefined when the grammar cannot express it.
     */
    function mentionOf(kind, relative) {
      if (relative === '') return undefined;
      const path = kind === 'directory' ? relative + '/' : relative;
      if (/[\u0000-\u001f\u007f-\u009f"]/.test(path)) return undefined;
      return /\s/.test(path) ? '@"' + path + '"' : '@' + path;
    }
    /** Chip label: the basename, with a trailing `/` for folders. */
    function labelOf(kind, relative) {
      const trimmed = relative.replace(/\/+$/, '');
      const base = trimmed.split('/').pop() || trimmed;
      return kind === 'directory' ? base + '/' : base;
    }

    // ---------------------------------------------------------- actions
    async function copyToClipboard(text) {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        return;
      }
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      if (!ok) throw new Error('copy failed');
    }

    function runCopy(key, text) {
      if (typeof text !== 'string' || text === '') {
        showFeedback(key, false);
        return;
      }
      Promise.resolve()
        .then(() => copyToClipboard(text))
        .then(() => {
          showFeedback(key, true);
          setTimeout(() => {
            if (state.menu !== null && state.feedback !== null && state.feedback.key === key) closeMenu();
          }, 650);
        })
        .catch(() => {
          showFeedback(key, false);
        });
    }

    /**
     * Console diagnostics for the chip-insert route; keeps fallbacks explainable.
     */
    function warn(reason, detail) {
      console.warn('[file-tree-context-menu] ' + reason, detail === undefined ? '' : detail);
    }

    /** Resolve the client `sessions` service from the plugin context. */
    function getSessionsService() {
      const ctx = pluginCtx;
      if (ctx === null) return undefined;
      try {
        if (typeof ctx.get === 'function') {
          const found = ctx.get('sessions');
          if (found !== undefined && found !== null) return found;
        }
      } catch (_error) {
        // fall through to the property access below
      }
      return ctx.sessions;
    }

    /**
     * Add one @-mention to the composer. Prefers a real reference chip via the
     * session-scope `slash/input-insert-reference` event; falls back to a plain
     * `insertText` of the mention with the same CAS span.
     * @returns 'chip', 'text', or false.
     */
    function addToComposer(kind, relative, mention) {
      const actions = inputActions;
      if (actions === null || typeof mention !== 'string' || mention === '') return false;
      let span;
      if (typeof actions.captureInsertion === 'function') {
        try {
          span = actions.captureInsertion();
        } catch (error) {
          warn('captureInsertion failed', error);
          span = undefined;
        }
      }
      // Chip route: fire the scoped event with the session's own context as the
      // bail thisArg (required for the per-session dispatch filter).
      if (span !== undefined && pluginCtx !== null && typeof sessionId === 'string' && sessionId !== '') {
        try {
          const sessions = getSessionsService();
          const actx = sessions !== undefined && sessions !== null && typeof sessions.scope === 'function'
            ? sessions.scope(sessionId)
            : undefined;
          if (actx === undefined || actx === null) {
            warn('sessions.scope(' + sessionId + ') returned no session context');
          } else if (typeof actx.bail !== 'function') {
            warn('session context has no bail()');
          } else {
            const reference = {
              source: 'reference',
              ref: mention,
              label: labelOf(kind, relative),
              appearance: kind === 'directory' ? 'folder' : 'file',
              clipboardText: mention
            };
            const applied = actx.bail(actx, 'slash/input-insert-reference', { reference, span });
            if (applied === true) return 'chip';
            warn('slash/input-insert-reference was not applied (phase busy, stale draftRev, or no listener)');
          }
        } catch (error) {
          warn('chip insert threw', error);
        }
      } else {
        warn('chip route unavailable (span/session/plugin context)');
      }
      if (typeof actions.insertText !== 'function') return false;
      try {
        const ok = span === undefined ? actions.insertText(mention) !== false : actions.insertText(mention, span) !== false;
        return ok ? 'text' : false;
      } catch (error) {
        warn('insertText failed', error);
        return false;
      }
    }

    function runAdd(kind, relative, mention) {
      const outcome = addToComposer(kind, relative, mention);
      if (outcome === false) {
        showFeedback('add', false, undefined);
        return;
      }
      if (outcome === 'chip') {
        closeMenu();
        return;
      }
      // Plain-text fallback: say so visibly, then close.
      showFeedback('add', true, 'status.addedText');
      setTimeout(() => {
        if (state.menu !== null && state.feedback !== null && state.feedback.key === 'add') closeMenu();
      }, 900);
    }

    // --------------------------------------------------------- components
    /** Invisible bridge: captures composer InputActions and session info from standard slot props. */
    function ComposerBridge(props) {
      const cwdValue = typeof props.useSessions === 'function' && typeof props.sessionId === 'string' && props.sessionId !== ''
        ? props.useSessions((sessions) => {
            const byId = sessions !== undefined && sessions !== null ? sessions.byId : undefined;
            const entry = byId !== undefined && byId !== null ? byId[props.sessionId] : undefined;
            return entry !== undefined && entry !== null ? entry.cwd : undefined;
          })
        : undefined;
      React.useEffect(() => {
        if (props.inputActions !== undefined && props.inputActions !== null) {
          inputActions = props.inputActions;
        }
        if (typeof props.sessionId === 'string' && props.sessionId !== '') sessionId = props.sessionId;
        if (typeof cwdValue === 'string' && cwdValue !== '') sessionCwd = cwdValue;
      });
      return null;
    }

    /** The floating context menu rendered in the frame-wide overlay layer. */
    function FileTreeContextMenu() {
      const current = React.useSyncExternalStore(subscribe, snapshot, snapshot);
      const panelRef = React.useRef(null);
      const menuState = current.menu;
      const open = menuState !== null;

      // Place the measured panel inside the viewport, then focus the first row.
      const [position, setPosition] = React.useState({ left: -9999, top: -9999 });
      React.useLayoutEffect(() => {
        if (!open || menuState === null) return undefined;
        const panel = panelRef.current;
        const width = panel === null ? 220 : panel.offsetWidth;
        const height = panel === null ? 140 : panel.offsetHeight;
        const margin = 8;
        setPosition({
          left: Math.min(menuState.x, Math.max(margin, window.innerWidth - width - margin)),
          top: Math.min(menuState.y, Math.max(margin, window.innerHeight - height - margin))
        });
        const first = panel !== null ? panel.querySelector('button') : null;
        if (first !== null) first.focus();
        return undefined;
      }, [open, menuState]);

      // Close on outside pointer, Escape, resize, and scroll.
      React.useEffect(() => {
        if (!open) return undefined;
        const onPointer = (event) => {
          const panel = panelRef.current;
          if (panel !== null && event.target instanceof Node && panel.contains(event.target)) return;
          closeMenu();
        };
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            closeMenu();
          }
        };
        const onMove = () => closeMenu();
        window.addEventListener('mousedown', onPointer, true);
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('resize', onMove);
        window.addEventListener('scroll', onMove, true);
        return () => {
          window.removeEventListener('mousedown', onPointer, true);
          window.removeEventListener('keydown', onKey, true);
          window.removeEventListener('resize', onMove);
          window.removeEventListener('scroll', onMove, true);
        };
      }, [open]);

      if (!open || menuState === null) return null;

      const kind = menuState.kind;
      const relative = relativeOf(menuState.root, menuState.path);
      const absolute = nativeAbsolute(menuState.root, menuState.path);
      const mention = mentionOf(kind, relative);

      const item = (key, label, run) => {
        const mine = current.feedback !== null && current.feedback.key === key;
        const text = mine
          ? (current.feedback.ok ? t(current.feedback.textKey || 'status.copied') : t('status.failed'))
          : label;
        return h('button', {
          key,
          type: 'button',
          role: 'menuitem',
          className: 'ftcm-item',
          'data-state': mine ? (current.feedback.ok ? 'copied' : 'failed') : undefined,
          onClick: run
        }, text);
      };

      const onKeyDown = (event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const panel = panelRef.current;
        if (panel === null) return;
        const items = Array.from(panel.querySelectorAll('button'));
        const index = items.indexOf(document.activeElement);
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const next = items[(index + delta + items.length) % items.length];
        if (next !== undefined) next.focus();
      };

      return h('div', {
        ref: panelRef,
        role: 'menu',
        'aria-label': t('menu.label'),
        className: 'ftcm-panel',
        style: { left: position.left, top: position.top },
        onKeyDown
      }, [
        item('add', t('menu.add'), () => runAdd(kind, relative, mention)),
        item('mention', t('menu.copyMention'), () => runCopy('mention', mention)),
        h('div', { key: 'sep', role: 'separator', className: 'ftcm-sep' }),
        item('absolute', t('menu.copyAbsolute'), () => runCopy('absolute', absolute)),
        item('relative', t('menu.copyRelative'), () => runCopy('relative', relative))
      ]);
    }

    // --------------------------------------------------------------- body
    /** Bound dictionary reader, set once the locale service is wired. */
    let t = (key) => key;

    /**
     * Client plugin body: intercept right-clicks in the workspace file tree and
     * answer them with the floating action menu.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      pluginCtx = ctx;
      ctx.effect(() => insertCss(CSS), 'file-tree-context-menu: stylesheet');
      if (ctx.locale) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'file-tree-context-menu: dictionaries');
        t = ctx.locale.bind(NS);
      }

      /**
       * Resolve a right-clicked element to a file/folder identity, or null when
       * the element is not a supported row. Covers the workspace file tree and
       * the three deliverable surfaces.
       */
      const resolveHit = (target) => {
        // Workspace file tree rows: path and root come from the tree's markers.
        const row = target.closest('li[data-files-entry][data-files-path]');
        if (row !== null) {
          const container = row.closest('[data-files-root]');
          if (container === null) return null;
          return {
            root: container.getAttribute('data-files-root') || '',
            path: row.getAttribute('data-files-path') || '',
            kind: row.getAttribute('data-files-entry') || 'file'
          };
        }
        // Delivered-file cards: the cover button's title is the resolved path.
        const presented = target.closest('[data-presented-file]');
        if (presented !== null) {
          const cover = presented.querySelector('button');
          const resolved = cover === null ? '' : (cover.getAttribute('title') || '');
          if (resolved === '') return null;
          return { root: sessionCwd || '', path: resolved, kind: 'file' };
        }
        // Changed-files cards: the hidden aria-describedby span holds the resolved path.
        const changed = target.closest('div[data-changed-files]');
        if (changed !== null) {
          const button = target.closest('button');
          const described = button === null ? '' : (button.getAttribute('aria-describedby') || '');
          const hidden = described === '' ? null : document.getElementById(described);
          const resolved = hidden === null ? '' : (hidden.textContent || '').trim();
          if (resolved === '') return null;
          return { root: sessionCwd || '', path: resolved, kind: 'file' };
        }
        // Review sidebar file selector: data-review-file carries the raw path.
        const review = target.closest('[data-review-file]');
        if (review !== null) {
          const raw = review.getAttribute('data-review-file') || '';
          if (raw === '') return null;
          return { root: sessionCwd || '', path: raw, kind: /\/$/.test(raw) ? 'directory' : 'file' };
        }
        return null;
      };

      const onContextMenu = (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const hit = resolveHit(target);
        if (hit === null) return;
        event.preventDefault();
        event.stopPropagation();
        openMenu({
          x: event.clientX,
          y: event.clientY,
          root: hit.root,
          path: hit.path,
          kind: hit.kind
        });
      };
      document.addEventListener('contextmenu', onContextMenu, true);
      ctx.effect(() => () => document.removeEventListener('contextmenu', onContextMenu, true),
        'file-tree-context-menu: listener');

      // Invisible bridges that capture the composer's InputActions from the
      // standard provide channel, from the file tab and from the composer row.
      const registration = (name, component, order) => () => ctx.slots.register({ name, id: 'file-tree-context-menu', order }, component);
      ctx.slots.inject('sidebar.right.tab.files.actions', registration('sidebar.right.tab.files.actions', ComposerBridge, 90));
      ctx.slots.inject('conversation.input.left', registration('conversation.input.left', ComposerBridge, 90));
      ctx.slots.inject('shell.overlay', registration('shell.overlay', FileTreeContextMenu, 60));
    }

    return { inject: ['slots', 'locale'], apply };
  }
});
