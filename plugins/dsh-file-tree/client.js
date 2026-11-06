/**
 * File-tree context menu for the DeepSeek Harness Web UI.
 *
 * Right-clicking a row of the workspace file tree (the `files` right-sidebar tab
 * owned by @deepseek-ai/dsh-client-ui-sidebar-files) — or a delivered-file card /
 * changed-files card / review file selector owned by
 * @deepseek-ai/dsh-client-ui-deliverables — opens a small menu that can:
 *   - add the file/folder to the conversation composer as a reference chip,
 *   - copy the @-mention form, file:// URL, Markdown link, absolute/relative path,
 *   - preview the file in DSH's right sidebar,
 *   - open it with the default application (a web page lands in the browser),
 *   - reveal it in the OS file manager, or open a terminal at its folder,
 *   - summarize / explain it with AI by pre-filling a prompt,
 *   - create files/folders, rename, and move entries to the Recycle Bin,
 *   - multi-select rows and batch-add or batch-copy them,
 *   - read the workspace's Git status and paint changed rows with branch-aware
 *     badges and per-path change state in the menu.
 *
 * Open/reveal reuse the core Session Remote (`ctx.remote.session`):
 * `openWorkspacePath({ path, action })` and `workspacePathApplications({ path })`,
 * gated by `canOpenWorkspacePath()` so pure-web deployments hide the group.
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
  id: 'dsh-file-tree',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // ---------------------------------------------------------------- locale
    /** Dictionary namespace owned by this plugin. */
    const NS = 'dsh-file-tree';
    /** Simplified Chinese dictionary (key-set source of truth). */
    const zh = {
      'menu.label': '文件操作',
      'menu.add': '加入对话',
      'menu.copyMention': '复制 @ 引用',
      'menu.copyAbsolute': '复制绝对路径',
      'menu.copyRelative': '复制相对路径',
      'menu.copyName': '复制名称',
      'menu.open': '用默认应用打开',
      'menu.openFolder': '在文件管理器中打开',
      'menu.reveal': '在文件夹中显示',
      'menu.browser': '用浏览器打开',
      'menu.preview': '在 DSH 中预览',
      'menu.terminal': '在终端中打开',
      'menu.terminalHere': '在终端中打开所在目录',
      'menu.aiSummary': '用 AI 总结',
      'menu.aiExplain': '用 AI 解释',
      'ai.summaryPrompt': '请总结这个文件的要点。',
      'ai.explainPrompt': '请解释这个文件的内容和作用。',
      'menu.copyFileUrl': '复制 file:// 链接',
      'menu.copyMarkdown': '复制 Markdown 链接',
      'menu.newFile': '新建文件',
      'menu.newFolder': '新建文件夹',
      'menu.rename': '重命名',
      'menu.delete': '删除（移到回收站）',
      'menu.selectedCount': '已选 {count} 项',
      'menu.addSelected': '加入对话（{count} 项）',
      'menu.copySelected': '复制已选路径',
      'menu.clearSelection': '清空选择',
      'menu.createIn': '新建于「{name}」',
      'form.newFileTitle': '新建文件',
      'form.newFolderTitle': '新建文件夹',
      'form.renameTitle': '重命名',
      'form.deleteTitle': '删除',
      'form.namePlaceholder': '名称',
      'form.confirm': '确定',
      'form.cancel': '取消',
      'form.deleteFile': '将“{name}”移到回收站？',
      'form.deleteFolder': '将文件夹“{name}”及其全部内容移到回收站？',
      'status.created': '已创建',
      'status.renamed': '已重命名',
      'status.deleted': '已移到回收站',
      'status.opFailed': '文件操作失败',
      'status.nameRequired': '请输入名称',
      'status.previewFailed': '无法在 DSH 中预览',
      'status.termFailed': '无法打开终端',
      'status.copied': '已复制',
      'status.addedText': '已插入文本（非芯片）',
      'status.failed': '操作失败',
      'status.opened': '已打开',
      'status.openFailed': '打开失败',
      'status.revealFailed': '无法显示位置',
      'status.unavailable': '当前环境不支持本地打开',
      'git.tone.modified': '已修改',
      'git.tone.added': '新增',
      'git.tone.deleted': '已删除',
      'git.tone.untracked': '未跟踪',
      'git.tone.renamed': '已重命名',
      'git.tone.copied': '已复制',
      'git.tone.conflict': '有冲突',
      'git.clean': '工作区干净',
      'git.changedCount': '{count} 个改动',
      'git.detached': '游离 HEAD',
      'git.unknownBranch': '未知分支',
      'git.ahead': '领先远程 {count} 个提交',
      'git.behind': '落后远程 {count} 个提交',
      'git.synced': '已与远程同步',
      'git.localOnly': '无上游分支',
      'git.unpushed': '有 {count} 个提交未推送',
      'git.notPushed': '未推送',
      'git.folder': '文件夹',
      'git.staged': '已暂存',
      'git.unstaged': '未暂存',
      'git.stagedAndUnstaged': '已暂存 + 未暂存',
      'git.operation.merge': '合并中',
      'git.operation.rebase': '变基中',
      'git.operation.cherry-pick': '拣选中',
      'git.operation.revert': '回退中',
      'git.operation.bisect': '二分查找中',
      'git.directoryChanged': '{count} 个文件有改动',
      'git.entryClean': '无改动'
    };
    /** English dictionary, key-identical to the Chinese source of truth. */
    const en = {
      'menu.label': 'File actions',
      'menu.add': 'Add to conversation',
      'menu.copyMention': 'Copy @-mention',
      'menu.copyAbsolute': 'Copy absolute path',
      'menu.copyRelative': 'Copy relative path',
      'menu.copyName': 'Copy name',
      'menu.open': 'Open with default app',
      'menu.openFolder': 'Open in file manager',
      'menu.reveal': 'Show in folder',
      'menu.browser': 'Open in browser',
      'menu.preview': 'Preview in DSH',
      'menu.terminal': 'Open in terminal',
      'menu.terminalHere': 'Open containing folder in terminal',
      'menu.aiSummary': 'Summarize with AI',
      'menu.aiExplain': 'Explain with AI',
      'ai.summaryPrompt': 'Please summarize the key points of this file.',
      'ai.explainPrompt': 'Please explain the contents and purpose of this file.',
      'menu.copyFileUrl': 'Copy file:// link',
      'menu.copyMarkdown': 'Copy Markdown link',
      'menu.newFile': 'New file',
      'menu.newFolder': 'New folder',
      'menu.rename': 'Rename',
      'menu.delete': 'Delete (move to Recycle Bin)',
      'menu.selectedCount': '{count} selected',
      'menu.addSelected': 'Add {count} to conversation',
      'menu.copySelected': 'Copy selected paths',
      'menu.clearSelection': 'Clear selection',
      'menu.createIn': 'Create in “{name}”',
      'form.newFileTitle': 'New file',
      'form.newFolderTitle': 'New folder',
      'form.renameTitle': 'Rename',
      'form.deleteTitle': 'Delete',
      'form.namePlaceholder': 'Name',
      'form.confirm': 'OK',
      'form.cancel': 'Cancel',
      'form.deleteFile': 'Move “{name}” to the Recycle Bin?',
      'form.deleteFolder': 'Move folder “{name}” and all its contents to the Recycle Bin?',
      'status.created': 'Created',
      'status.renamed': 'Renamed',
      'status.deleted': 'Moved to Recycle Bin',
      'status.opFailed': 'File operation failed',
      'status.nameRequired': 'Enter a name',
      'status.previewFailed': 'Could not preview in DSH',
      'status.termFailed': 'Could not open terminal',
      'status.copied': 'Copied',
      'status.addedText': 'Inserted as text (no chip)',
      'status.failed': 'Action failed',
      'status.opened': 'Opened',
      'status.openFailed': 'Could not open',
      'status.revealFailed': 'Could not show location',
      'status.unavailable': 'Local opening is unavailable here',
      'git.tone.modified': 'Modified',
      'git.tone.added': 'Added',
      'git.tone.deleted': 'Deleted',
      'git.tone.untracked': 'Untracked',
      'git.tone.renamed': 'Renamed',
      'git.tone.copied': 'Copied',
      'git.tone.conflict': 'Conflict',
      'git.clean': 'Working tree clean',
      'git.changedCount': '{count} changed',
      'git.detached': 'Detached HEAD',
      'git.unknownBranch': 'Unknown branch',
      'git.ahead': '{count} ahead of upstream',
      'git.behind': '{count} behind upstream',
      'git.synced': 'Up to date with upstream',
      'git.localOnly': 'No upstream branch',
      'git.unpushed': '{count} commits not pushed',
      'git.notPushed': 'Not pushed',
      'git.folder': 'folder',
      'git.staged': 'staged',
      'git.unstaged': 'unstaged',
      'git.stagedAndUnstaged': 'staged + unstaged',
      'git.operation.merge': 'merging',
      'git.operation.rebase': 'rebasing',
      'git.operation.cherry-pick': 'cherry-picking',
      'git.operation.revert': 'reverting',
      'git.operation.bisect': 'bisecting',
      'git.directoryChanged': '{count} changed files',
      'git.entryClean': 'No changes'
    };

    // ------------------------------------------------------------------ css
    const CSS_TAG_ID = 'dsh-file-tree/style';
    const CSS = [
      '.dft-panel{position:fixed;z-index:100000;min-width:196px;padding:4px;',
      'box-sizing:border-box;border-radius:8px;background:var(--dsw-alias-bg-overlay);',
      'border:1px solid var(--dsw-alias-border-l2);box-shadow:0 8px 28px rgba(0,0,0,.22);',
      'font-family:var(--dsw-font-family,sans-serif);font-size:13px;}',
      '.dft-item{display:flex;align-items:center;width:100%;height:28px;padding:0 10px;',
      'border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);',
      'font:inherit;text-align:left;cursor:pointer;white-space:nowrap;}',
      '.dft-item:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.dft-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px;}',
      '.dft-item[data-state="copied"]{color:var(--dsw-alias-state-success-primary);}',
      '.dft-item[data-state="failed"]{color:var(--dsw-alias-state-error-primary);}',
      '.dft-item:disabled{opacity:.55;cursor:default;}',
      '.dft-item-label{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;}',
      '.dft-icon{width:16px;height:16px;flex:none;border-radius:3px;object-fit:contain;}',
      '.dft-hint{margin-left:6px;color:var(--dsw-alias-label-tertiary);font-size:11px;}',
      '.dft-note{padding:6px 10px;color:var(--dsw-alias-label-tertiary);font-size:12px;}',
      '.dft-panel{max-height:calc(100vh - 16px);overflow-y:auto;}',
      '.dft-sep{height:1px;margin:4px 6px;background:var(--dsw-alias-border-l1);}',
      'li[data-dft-selected="true"]{background:var(--dsw-alias-bg-layer-2);',
      'box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary);}',
      '.dft-form{display:flex;flex-direction:column;gap:8px;padding:8px 10px 10px;min-width:240px;}',
      '.dft-form-title{font-weight:600;color:var(--dsw-alias-label-primary);}',
      '.dft-form-desc{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5;white-space:normal;}',
      '.dft-input{height:30px;padding:0 8px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);',
      'background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;outline:none;box-sizing:border-box;}',
      '.dft-input:focus{border-color:var(--dsw-alias-brand-primary);}',
      '.dft-form-error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.4;}',
      '.dft-form-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:2px;}',
      '.dft-btn{height:28px;padding:0 12px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);',
      'background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;}',
      '.dft-btn:hover{background:var(--dsw-alias-bg-layer-2);}',
      '.dft-btn-primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff;}',
      '.dft-btn-danger{background:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);color:#fff;}',
      '.dft-btn:disabled{opacity:.55;cursor:default;}',
      '.dft-git-info{display:flex;flex-wrap:wrap;align-items:center;gap:3px 6px;max-width:300px;',
      'padding:6px 10px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.5;}',
      '.dft-git-branch{max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
      'color:var(--dsw-alias-label-primary);font-weight:600;}',
      '.dft-git-clean{color:var(--dsw-alias-state-success-primary);}',
      '.dft-git-count{color:var(--dsw-alias-label-secondary);}',
      '.dft-git-chip{padding:0 4px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);',
      'color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:16px;white-space:nowrap;}',
      '.dft-git-chip[data-dft-git-tone="modified"]{color:var(--dsw-alias-state-warn-primary);}',
      '.dft-git-chip[data-dft-git-tone="added"],.dft-git-chip[data-dft-git-tone="untracked"],.dft-git-chip[data-dft-git-tone="copied"]{color:var(--dsw-alias-state-success-primary);}',
      '.dft-git-chip[data-dft-git-tone="deleted"],.dft-git-chip[data-dft-git-tone="conflict"]{color:var(--dsw-alias-state-error-primary);}',
      '.dft-git-chip[data-dft-git-tone="renamed"]{color:var(--dsw-alias-state-business-primary);}',
      '.dft-git-entry{display:flex;align-items:center;gap:6px;padding:0 10px 6px;',
      'color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1.5;}',
      '.dft-git-entry-detail{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dft-git-ahead{color:var(--dsw-alias-state-warn-primary);font-weight:600;}',
      '.dft-git-behind{color:var(--dsw-alias-state-business-primary);font-weight:600;}',
      '.dft-git-synced{color:var(--dsw-alias-state-success-primary);}',
      '.dft-git-muted{color:var(--dsw-alias-label-tertiary);}',
      // The files-header pill: branch plus how far the branch is from its upstream.
      '.dft-sync{display:inline-flex;align-items:center;gap:5px;flex:none;height:22px;',
      'margin-left:2px;padding:0 8px;border-radius:11px;border:1px solid var(--dsw-alias-border-l2);',
      'background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);',
      'font:inherit;font-size:11px;line-height:1;white-space:nowrap;cursor:pointer;}',
      '.dft-sync:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',
      '.dft-sync[data-dft-sync="unpushed"]{border-color:var(--dsw-alias-state-warn-primary);}',
      '.dft-sync[data-dft-sync="unpushed"] .dft-sync-ahead{color:var(--dsw-alias-state-warn-primary);font-weight:700;}',
      '.dft-sync-branch{max-width:88px;overflow:hidden;text-overflow:ellipsis;',
      'color:var(--dsw-alias-label-primary);font-weight:600;}',
      '.dft-sync-ahead{color:var(--dsw-alias-label-secondary);}',
      '.dft-sync-behind{color:var(--dsw-alias-state-business-primary);}',
      '.dft-sync-clean{color:var(--dsw-alias-state-success-primary);}',
      '.dft-sync-muted{color:var(--dsw-alias-label-tertiary);font-weight:400;}',
      '.ZaWTnW_name[data-dft-git]{font-weight:500;}',
      '.ZaWTnW_name[data-dft-git="modified"]{color:var(--dsw-alias-state-warn-primary);}',
      '.ZaWTnW_name[data-dft-git="added"],.ZaWTnW_name[data-dft-git="untracked"],.ZaWTnW_name[data-dft-git="copied"]{color:var(--dsw-alias-state-success-primary);}',
      '.ZaWTnW_name[data-dft-git="deleted"],.ZaWTnW_name[data-dft-git="conflict"]{color:var(--dsw-alias-state-error-primary);}',
      '.ZaWTnW_name[data-dft-git="renamed"]{color:var(--dsw-alias-state-business-primary);}',
      '.ZaWTnW_name[data-dft-git="conflict"]{font-weight:700;}',
      '.ZaWTnW_name[data-dft-git]::after{content:attr(data-dft-git-letter);margin-left:4px;',
      'font-size:9px;font-weight:700;line-height:1;opacity:.9;vertical-align:1px;}',
      '.ZaWTnW_action[data-dft-git]::after{content:attr(data-dft-git-letter);margin-left:4px;',
      'font-size:9px;font-weight:700;line-height:1;opacity:.9;flex:none;}',
      '.ZaWTnW_action[data-dft-git="modified"]::after{color:var(--dsw-alias-state-warn-primary);}',
      '.ZaWTnW_action[data-dft-git="added"]::after,.ZaWTnW_action[data-dft-git="untracked"]::after,.ZaWTnW_action[data-dft-git="copied"]::after{color:var(--dsw-alias-state-success-primary);}',
      '.ZaWTnW_action[data-dft-git="deleted"]::after,.ZaWTnW_action[data-dft-git="conflict"]::after{color:var(--dsw-alias-state-error-primary);}',
      '.ZaWTnW_action[data-dft-git="renamed"]::after{color:var(--dsw-alias-state-business-primary);}'
    ].join('');

    /** Insert the plugin stylesheet, preferring the Client `styles` builtin. */
    function insertCss(css) {
      if (typeof styles !== 'undefined' && styles && typeof styles.insert === 'function') {
        return styles.insert(css);
      }
      const existing = document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_TAG_ID) + ']');
      if (existing !== null) return () => {};
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-file-tree';
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
    /** Whether the serving desktop can open/reveal Host paths; null until answered. */
    let desktopAvailable = null;
    /** Client plugin context, kept for `ctx.get(...)` service lookups. */
    let pluginCtx = null;
    /** Ctrl/Shift multi-selection of file-tree rows: {root, path, kind}. */
    let selection = [];
    /** Anchor entry for Shift range selection. */
    let selectionAnchor = null;
    const listeners = new Set();

    function publish() {
      for (const listener of listeners) listener();
    }
    /** Repaint the open menu and the header pill after the git reading changed. */
    function repaintGit() {
      // A fresh object identity is what makes `useSyncExternalStore` re-render,
      // even when only the shared git maps changed.
      state = { menu: state.menu, feedback: state.feedback };
      publish();
    }
    function subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
    function snapshot() {
      return state;
    }
    function openMenu(next) {
      state = { menu: { ...next, view: 'main', prompt: null }, feedback: null };
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
    /** Switch the open menu to an inline text/confirmation form. */
    function openPrompt(mode, fields) {
      if (state.menu === null) return;
      state = { menu: { ...state.menu, view: 'prompt', prompt: { mode, value: '', error: null, ...fields } }, feedback: null };
      publish();
    }
    /** Keep the inline form's controlled input in sync. */
    function setPromptValue(value) {
      const menu = state.menu;
      if (menu === null || menu.view !== 'prompt' || menu.prompt === null) return;
      state = { menu: { ...menu, prompt: { ...menu.prompt, value, error: null } }, feedback: state.feedback };
      publish();
    }
    /** Show a validation/action failure inside the inline form. */
    function setPromptError(error) {
      const menu = state.menu;
      if (menu === null || menu.view !== 'prompt' || menu.prompt === null) return;
      state = { menu: { ...menu, prompt: { ...menu.prompt, error } }, feedback: state.feedback };
      publish();
    }

    // -------------------------------------------------------- multi-select
    /** Read one file-tree row into a selection entry, or null when it is not a row. */
    function fileTreeEntry(row) {
      if (row === null || row === undefined) return null;
      const container = row.closest('[data-files-root]');
      if (container === null) return null;
      return {
        root: container.getAttribute('data-files-root') || '',
        path: row.getAttribute('data-files-path') || '',
        kind: row.getAttribute('data-files-entry') || 'file'
      };
    }
    /** Stable comparison key for a selection entry. */
    function selectionKey(entry) {
      return (entry.root + '|' + toSlashes(entry.path)).toLowerCase();
    }
    /** Whether one entry is currently selected. */
    function isEntrySelected(entry) {
      const key = selectionKey(entry);
      return selection.some((item) => selectionKey(item) === key);
    }
    /** Mirror selection state onto the file-tree DOM rows. */
    function syncSelectionDom() {
      const rows = document.querySelectorAll('[data-files-root] li[data-files-entry][data-files-path]');
      for (const row of rows) {
        const entry = fileTreeEntry(row);
        if (entry === null) continue;
        if (isEntrySelected(entry)) row.setAttribute('data-dft-selected', 'true');
        else row.removeAttribute('data-dft-selected');
      }
    }
    /** Drop the whole multi-selection. */
    function clearSelection() {
      if (selection.length === 0) return;
      selection = [];
      selectionAnchor = null;
      syncSelectionDom();
      publish();
    }
    /** Toggle one entry with Ctrl/Cmd-click. */
    function toggleSelection(entry) {
      const key = selectionKey(entry);
      if (selection.some((item) => selectionKey(item) === key)) {
        selection = selection.filter((item) => selectionKey(item) !== key);
      } else {
        if (selection.length > 0 && selection[0].root.toLowerCase() !== entry.root.toLowerCase()) selection = [];
        selection = selection.concat([entry]);
      }
      selectionAnchor = entry;
      syncSelectionDom();
      publish();
    }
    /** Select the visible range between the anchor and one entry with Shift-click. */
    function selectRange(entry) {
      const rows = Array.from(document.querySelectorAll('[data-files-root] li[data-files-entry][data-files-path]'))
        .map((row) => fileTreeEntry(row))
        .filter((item) => item !== null);
      if (selectionAnchor === null || selectionAnchor.root.toLowerCase() !== entry.root.toLowerCase()) {
        selection = [entry];
        selectionAnchor = entry;
        syncSelectionDom();
        publish();
        return;
      }
      const anchorIndex = rows.findIndex((item) => selectionKey(item) === selectionKey(selectionAnchor));
      const targetIndex = rows.findIndex((item) => selectionKey(item) === selectionKey(entry));
      if (anchorIndex < 0 || targetIndex < 0) {
        selection = [entry];
        selectionAnchor = entry;
      } else {
        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        selection = rows.slice(start, end + 1).filter((item) => item.kind !== 'other');
      }
      syncSelectionDom();
      publish();
    }
    /** Keep the selection color after the tree re-renders rows. */
    function installSelectionObserver() {
      if (typeof MutationObserver !== 'function') return () => {};
      let scheduled = false;
      const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        Promise.resolve().then(() => {
          scheduled = false;
          if (selection.length > 0) syncSelectionDom();
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
      return () => observer.disconnect();
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
     * Absolute Host path for a resolved or relative row value, in native separators.
     * Already-absolute values are preserved (delivered cards and review rows report
     * absolute or workspace-relative paths interchangeably).
     */
    function absoluteOf(root, path) {
      if (/^[A-Za-z]:[\\/]/.test(path)) return path.replace(/\//g, '\\');
      if (path.startsWith('\\\\')) return path.replace(/\//g, '\\');
      if (path.startsWith('/')) return path;
      const windows = /^[A-Za-z]:/.test(root) || root.startsWith('\\\\');
      const sep = windows ? '\\' : '/';
      return root.replace(/[\\/]+$/, '') + sep + toSlashes(path).replace(/^\/+/, '').split('/').join(sep);
    }
    /** Native parent directory of one absolute path. */
    function dirnameOf(path) {
      const index = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
      return index > 0 ? path.slice(0, index) : path;
    }
    /** Encode one file-address segment, keeping Windows drive colons literal. */
    function encodeSegment(segment) {
      return encodeURIComponent(segment).replace(/%3A/gi, ':');
    }
    /** Turn an absolute host path into a clickable file:// URL. */
    function fileUrlOf(path) {
      const normalized = toSlashes(path);
      const encoded = normalized.split('/').map(encodeSegment).join('/');
      if (/^[A-Za-z]:\//.test(normalized)) return 'file:///' + encoded;
      if (normalized.startsWith('//')) return 'file:' + encoded;
      return 'file://' + encoded;
    }
    /** Build a Markdown link whose target is workspace-relative when possible. */
    function markdownLinkOf(kind, relative, absolute, label) {
      const target = relative !== '' ? (kind === 'directory' ? relative + '/' : relative) : toSlashes(absolute);
      const safeLabel = label.replace(/([\\\[\]])/g, '\\$1');
      const safeTarget = target.replace(/</g, '%3C').replace(/>/g, '%3E');
      return '[' + safeLabel + '](<' + safeTarget + '>)';
    }
    /** Build the Sidebar file address for the active Session, matching the file tree. */
    function sessionFileAddressOf(root, path) {
      if (typeof sessionId !== 'string' || sessionId === '') return undefined;
      const absolute = toSlashes(absoluteOf(root, path));
      const base = toSlashes(root).replace(/\/+$/, '');
      let relative = absolute;
      if (base !== '') {
        if (absolute.toLowerCase() === base.toLowerCase()) relative = '';
        else if (absolute.toLowerCase().startsWith(base.toLowerCase() + '/')) relative = absolute.slice(base.length + 1);
      }
      return 'dsh-resource://file/session/' + encodeURIComponent(sessionId) + '/' +
        relative.split('/').map(encodeSegment).join('/');
    }
    /** Resolve a client service by name, tolerating the property form. */
    function getClientService(name) {
      const ctx = pluginCtx;
      if (ctx === null) return undefined;
      try {
        if (typeof ctx.get === 'function') {
          const found = ctx.get(name);
          if (found !== undefined && found !== null) return found;
        }
      } catch (_error) {
        // fall through
      }
      return ctx[name];
    }
    /** Root-relative, same-origin URL for the host file-operation route. */
    function fileOpsUrl() {
      return new URL('api/dft.fileops', document.baseURI).href;
    }
    /** Call the host-side create/rename/trash/terminal route. */
    async function callFileOp(payload) {
      const response = await fetch(fileOpsUrl(), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      let data = null;
      try { data = await response.json(); } catch (_error) { data = null; }
      if (!response.ok || data === null || data.ok !== true) {
        throw new Error(data !== null && typeof data.error === 'string' ? data.error : 'HTTP ' + response.status);
      }
      return data;
    }
    // ------------------------------------------------------------------ git
    /**
     * Git status shared by the row decorations and the menu header: one reading
     * per workspace root, shared by every consumer, refreshed on a slow timer and
     * on the events that make it stale (window focus, menu opening, file
     * operations). A non-repository answer is cached too, so a plain folder never
     * re-runs discovery on every poll.
     */
    const GIT_POLL_MS = 20000;
    /** Tone → badge letter, used when a directory aggregates several children. */
    const GIT_DIR_LETTER = { conflict: '!', deleted: 'D', added: 'A', renamed: 'R', copied: 'C', modified: 'M', untracked: 'U' };
    /** The Path column's tone for one row, or undefined when the row is clean. */
    const GIT_ROW_TONE = { modified: 'modified', added: 'added', deleted: 'deleted', untracked: 'untracked', renamed: 'renamed', copied: 'copied', conflict: 'conflict' };
    const gitSnapshots = new Map();
    const gitPending = new Set();
    const gitFetchedAt = new Map();

    /** Root-relative, same-origin URL for the host git-status route. */
    function gitStatusUrl() {
      return new URL('api/dft.git', document.baseURI).href;
    }
    /** Normalize a path for status lookups: slashes, no trailing separator, lower case. */
    function gitKey(value) {
      return toSlashes(value).replace(/\/+$/, '').toLowerCase();
    }
    /** Directory tint precedence: a mixed folder reports its most serious change. */
    const GIT_TONE_RANK = { conflict: 7, deleted: 6, modified: 5, renamed: 4, added: 3, copied: 2, untracked: 1 };
    function mergeGitTone(current, next) {
      if (current === undefined) return next;
      if (next === undefined) return current;
      return (GIT_TONE_RANK[next] || 0) > (GIT_TONE_RANK[current] || 0) ? next : current;
    }
    /** Turn one host answer into the lookup tables the decorations read. */
    function indexGitSnapshot(snapshot) {
      const files = new Map();
      const dirs = new Map();
      for (const entry of Array.isArray(snapshot.entries) ? snapshot.entries : []) {
        const relative = typeof entry.relative === 'string' ? entry.relative : '';
        if (relative === '') continue;
        const key = gitKey(relative);
        files.set(key, entry);
        let dir = key;
        while (dir !== '') {
          dirs.set(dir, mergeGitTone(dirs.get(dir), entry.tone));
          const slash = dir.lastIndexOf('/');
          if (slash <= 0) break;
          dir = dir.slice(0, slash);
        }
      }
      return {
        isRepo: snapshot.isRepo === true,
        branch: snapshot.branch,
        detached: snapshot.detached === true,
        operation: snapshot.operation,
        hasUpstream: snapshot.hasUpstream === true,
        upstream: typeof snapshot.upstream === 'string' ? snapshot.upstream : '',
        ahead: typeof snapshot.ahead === 'number' ? snapshot.ahead : 0,
        behind: typeof snapshot.behind === 'number' ? snapshot.behind : 0,
        files,
        dirs
      };
    }
    /** One root's indexed reading, or undefined before the first answer. */
    function gitContext(root) {
      if (root === '' || root === undefined || root === null) return undefined;
      return gitSnapshots.get(gitKey(root));
    }
    /**
     * How far the checked-out branch is from its upstream. `unpushed` is the
     * answer the file tree never had: commits that exist only on this machine.
     */
    function gitSyncOf(context) {
      if (context === undefined || context === null || !context.isRepo) return null;
      const ahead = typeof context.ahead === 'number' ? context.ahead : 0;
      const behind = typeof context.behind === 'number' ? context.behind : 0;
      if (context.detached === true) return { state: 'detached', ahead, behind };
      if (context.hasUpstream !== true) return { state: 'local', ahead, behind };
      if (ahead > 0) return { state: behind > 0 ? 'diverged' : 'unpushed', ahead, behind };
      if (behind > 0) return { state: 'behind', ahead: 0, behind };
      return { state: 'synced', ahead: 0, behind: 0 };
    }
    /** Whether two readings are the same, so an unchanged poll skips a repaint. */
    function sameGitIndex(left, right) {
      if (left === right) return true;
      if (left.isRepo !== right.isRepo || left.branch !== right.branch || left.detached !== right.detached
        || left.operation !== right.operation || left.hasUpstream !== right.hasUpstream || left.upstream !== right.upstream
        || left.ahead !== right.ahead || left.behind !== right.behind) return false;
      if (left.files.size !== right.files.size || left.dirs.size !== right.dirs.size) return false;
      for (const [key, value] of left.files) {
        const other = right.files.get(key);
        if (other === undefined || other.tone !== value.tone || other.letter !== value.letter || other.staged !== value.staged || other.unstaged !== value.unstaged) return false;
      }
      for (const [key, value] of left.dirs) {
        if (right.dirs.get(key) !== value) return false;
      }
      return true;
    }
    /** Read one root's git status; a second call while one is in flight is ignored. */
    async function refreshGitStatus(root, force) {
      if (root === '' || root === undefined || root === null) return;
      const key = gitKey(root);
      if (gitPending.has(key)) return;
      if (force !== true && Date.now() - (gitFetchedAt.get(key) || 0) < 3000) return;
      gitPending.add(key);
      try {
        const response = await fetch(gitStatusUrl(), {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ root })
        });
        // A 401 page or a proxy error is HTML, not JSON; treat it as "unknown".
        const data = await response.json().catch(() => null);
        if (data !== null && data.ok === true && data.isRepo === false) {
          const next = {
            isRepo: false, branch: null, detached: false, operation: null,
            hasUpstream: false, upstream: '', ahead: 0, behind: 0,
            files: new Map(), dirs: new Map()
          };
          const previous = gitSnapshots.get(key);
          if (previous === undefined || previous.isRepo !== false) {
            gitSnapshots.set(key, next);
            syncGitDom();
            repaintGit();
          }
          return;
        }
        if (!response.ok || data === null || data.ok !== true || data.isRepo !== true) {
          if (gitSnapshots.has(key)) {
            gitSnapshots.delete(key);
            syncGitDom();
            repaintGit();
          }
          return;
        }
        const entries = (Array.isArray(data.entries) ? data.entries : [])
          .map((entry) => {
            if (entry === null || typeof entry.absolute !== 'string' || typeof entry.tone !== 'string') return null;
            const relative = relativeOf(root, entry.absolute);
            if (relative === '') return null;
            return {
              relative,
              tone: entry.tone,
              letter: typeof entry.letter === 'string' ? entry.letter : '',
              staged: entry.staged === true,
              unstaged: entry.unstaged === true
            };
          })
          .filter((entry) => entry !== null);
        const next = indexGitSnapshot({ ...data, entries });
        const previous = gitSnapshots.get(key);
        if (previous !== undefined && sameGitIndex(previous, next)) return;
        gitSnapshots.set(key, next);
        syncGitDom();
        repaintGit();
      } catch (error) {
        warn('git status failed', error);
      } finally {
        gitPending.delete(key);
        gitFetchedAt.set(key, Date.now());
      }
    }
    /** Decorate one file-tree row from the current reading. */
    function paintGitRow(row, root, path, kind) {
      const context = gitContext(root);
      const relative = relativeOf(root, path);
      let tone;
      let letter;
      if (context !== undefined && context.isRepo && relative !== '') {
        if (kind === 'directory') {
          tone = context.dirs.get(gitKey(relative));
          if (tone !== undefined) letter = GIT_DIR_LETTER[tone] === undefined ? GIT_DIR_LETTER.modified : GIT_DIR_LETTER[tone];
        } else {
          const entry = context.files.get(gitKey(relative));
          if (entry !== undefined && GIT_ROW_TONE[entry.tone] !== undefined) {
            tone = entry.tone;
            letter = entry.letter;
          }
        }
      }
      if (tone === undefined) {
        row.removeAttribute('data-dft-git');
        for (const stale of Array.from(row.querySelectorAll('[data-dft-git-owner="1"]'))) {
          stale.removeAttribute('data-dft-git');
          stale.removeAttribute('data-dft-git-letter');
          stale.removeAttribute('data-dft-git-owner');
          stale.removeAttribute('title');
          stale.removeAttribute('aria-label');
        }
        return;
      }
      row.setAttribute('data-dft-git', tone);
      const text = typeof letter === 'string' && letter !== '' ? letter : (GIT_DIR_LETTER[tone] || '•');
      const title = t('git.tone.' + tone) + (kind === 'directory' ? ' · ' + t('git.folder') : '');
      const name = row.querySelector('.ZaWTnW_name');
      if (name !== null) {
        name.setAttribute('data-dft-git', tone);
        name.setAttribute('data-dft-git-owner', '1');
        name.setAttribute('title', title);
      }
      // Put the letter after the name inside the row's action button. The
      // accessory cell is display:none while empty, and a pseudo-element would
      // not make it non-empty; the button is always rendered and visible.
      const action = row.querySelector('.ZaWTnW_action');
      const badge = action !== null ? action : name;
      if (badge !== null) {
        badge.setAttribute('data-dft-git', tone);
        badge.setAttribute('data-dft-git-letter', text);
        badge.setAttribute('data-dft-git-owner', '1');
        badge.setAttribute('title', title);
      }
    }
    /**
     * Mirror the current reading onto the live tree. The badge rides the native
     * name cell as an attribute and a pseudo-element, so no React child is ever
     * inserted into the file tree.
     */
    function syncGitDom() {
      const rows = document.querySelectorAll('li[data-files-entry][data-files-path]');
      for (const entry of Array.from(rows)) {
        const container = entry.closest('[data-files-root]');
        if (container === null) continue;
        const root = container.getAttribute('data-files-root') || '';
        if (root === '') continue;
        paintGitRow(entry, root, entry.getAttribute('data-files-path') || '', entry.getAttribute('data-files-entry') || 'file');
      }
    }
    /** The tree roots currently on screen, deduplicated. */
    function visibleTreeRoots() {
      const roots = new Set();
      for (const container of Array.from(document.querySelectorAll('[data-files-root]'))) {
        const root = container.getAttribute('data-files-root') || '';
        if (root !== '') roots.add(root);
      }
      return Array.from(roots);
    }
    /** Re-read every visible root; called on focus, on menu open, and by the timer. */
    function refreshVisibleGit() {
      for (const root of visibleTreeRoots()) void refreshGitStatus(root);
    }
    /** Start the slow poll and the focus-driven refresh; returns the teardown. */
    function startGitWatcher() {
      if (typeof window === 'undefined') return () => {};
      const onFocus = () => refreshVisibleGit();
      window.addEventListener('focus', onFocus);
      let scheduled = null;
      const observer = typeof MutationObserver === 'function' ? new MutationObserver(() => {
        if (scheduled !== null) return;
        scheduled = window.setTimeout(() => {
          scheduled = null;
          syncGitDom();
          refreshVisibleGit();
        }, 180);
      }) : null;
      if (observer !== null && document.body !== null) observer.observe(document.body, { childList: true, subtree: true });
      const timer = window.setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        syncGitDom();
        refreshVisibleGit();
      }, GIT_POLL_MS);
      syncGitDom();
      refreshVisibleGit();
      return () => {
        window.removeEventListener('focus', onFocus);
        window.clearInterval(timer);
        if (scheduled !== null) window.clearTimeout(scheduled);
        if (observer !== null) observer.disconnect();
      };
    }
    /**
     * The git block above the actions: the branch (or the operation in progress),
     * how many paths changed, and a per-tone count.
     */
    function gitInfoNode(root) {
      const context = gitContext(root);
      if (context === undefined || !context.isRepo) return null;
      const counts = new Map();
      for (const entry of context.files.values()) counts.set(entry.tone, (counts.get(entry.tone) || 0) + 1);
      const branchName = context.detached
        ? t('git.detached')
        : (typeof context.branch === 'string' && context.branch !== '' ? context.branch : t('git.unknownBranch'));
      const head = context.operation !== null && context.operation !== undefined
        ? branchName + ' · ' + t('git.operation.' + context.operation, {})
        : branchName;
      const changed = context.files.size;
      const children = [
        h('span', { key: 'branch', className: 'dft-git-branch', title: head }, head),
        changed === 0
          ? h('span', { key: 'count', className: 'dft-git-clean' }, t('git.clean'))
          : h('span', { key: 'count', className: 'dft-git-count' }, t('git.changedCount', { count: changed }))
      ];
      const sync = gitSyncOf(context);
      if (sync !== null && sync.ahead > 0) {
        children.push(h('span', {
          key: 'ahead',
          className: 'dft-git-count dft-git-ahead',
          title: t('git.ahead', { count: sync.ahead })
        }, '↑' + sync.ahead));
      }
      if (sync !== null && sync.behind > 0) {
        children.push(h('span', {
          key: 'behind',
          className: 'dft-git-count dft-git-behind',
          title: t('git.behind', { count: sync.behind })
        }, '↓' + sync.behind));
      }
      if (sync !== null && sync.state === 'synced') {
        children.push(h('span', { key: 'sync', className: 'dft-git-count dft-git-synced', title: t('git.synced') }, '✓'));
      }
      if (sync !== null && sync.state === 'local') {
        children.push(h('span', { key: 'sync', className: 'dft-git-count dft-git-muted', title: t('git.localOnly') }, '◎'));
      }
      const order = ['conflict', 'deleted', 'renamed', 'modified', 'added', 'untracked', 'copied'];
      for (const tone of order) {
        const value = counts.get(tone) || 0;
        if (value === 0) continue;
        const label = t('git.tone.' + tone) + ' ' + value;
        children.push(h('span', {
          key: 'tone-' + tone,
          className: 'dft-git-chip',
          'data-dft-git-tone': tone,
          title: label
        }, label));
      }
      return h('div', { key: 'git', className: 'dft-git-info', role: 'none' }, children);
    }
    /** The selected path's own git state, under the branch summary. */
    function gitEntryNode(root, path, kind) {
      const context = gitContext(root);
      if (context === undefined || !context.isRepo) return null;
      const relative = relativeOf(root, path);
      if (relative === '') return null;
      const key = gitKey(relative);
      if (kind === 'directory') {
        const tone = context.dirs.get(key);
        if (tone === undefined) return null;
        let count = 0;
        for (const entryKey of context.files.keys()) {
          if (entryKey === key || entryKey.startsWith(key + '/')) count += 1;
        }
        return h('div', { key: 'git-entry', className: 'dft-git-entry', role: 'none' }, [
          h('span', { key: 'tone', className: 'dft-git-chip', 'data-dft-git-tone': tone }, t('git.tone.' + tone)),
          h('span', { key: 'detail', className: 'dft-git-entry-detail' }, t('git.directoryChanged', { count: Math.max(1, count) }))
        ]);
      }
      const entry = context.files.get(key);
      if (entry === undefined) {
        return h('div', { key: 'git-entry', className: 'dft-git-entry', role: 'none' }, t('git.entryClean'));
      }
      const parts = [t('git.tone.' + entry.tone)];
      if (entry.tone !== 'untracked' && entry.staged === true && entry.unstaged === true) parts.push(t('git.stagedAndUnstaged'));
      else if (entry.tone !== 'untracked' && entry.staged === true) parts.push(t('git.staged'));
      else if (entry.tone !== 'untracked' && entry.unstaged === true) parts.push(t('git.unstaged'));
      return h('div', { key: 'git-entry', className: 'dft-git-entry', role: 'none' }, [
        h('span', { key: 'tone', className: 'dft-git-chip', 'data-dft-git-tone': entry.tone }, parts[0]),
        parts.length > 1 ? h('span', { key: 'detail', className: 'dft-git-entry-detail' }, parts.slice(1).join(' · ')) : null
      ]);
    }

    /**
     * The \`@path\` mention text, mirroring the composer file intake's
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

    /**
     * The files-header pill: the branch and its distance from the upstream.
     * The native header only shows the folder path, so "did I push?" had no
     * answer anywhere in the tree; this slot is the header's own right side.
     */
    function GitSyncPill() {
      // Subscribe so the pill repaints when a poll lands; the reading itself is
      // keyed by the session cwd that the bridge captured.
      React.useSyncExternalStore(subscribe, snapshot, snapshot);
      return gitSyncPillNode(sessionCwd);
    }
    /** Pure renderer for the pill, kept separate so tests can drive it. */
    function gitSyncPillNode(root) {
      const context = gitContext(root);
      if (context === undefined || !context.isRepo) return null;
      const sync = gitSyncOf(context);
      if (sync === null) return null;
      const branch = context.detached === true
        ? t('git.detached')
        : (typeof context.branch === 'string' && context.branch !== '' ? context.branch : t('git.unknownBranch'));
      const children = [h('span', { key: 'branch', className: 'dft-sync-branch', title: branch }, branch)];
      let state = 'synced';
      let label;
      let title;
      if (sync.state === 'detached') {
        state = 'unknown';
        label = '—';
        title = t('git.detached');
      } else if (sync.state === 'local') {
        state = 'local';
        label = '◎';
        title = t('git.localOnly');
      } else if (sync.ahead > 0) {
        state = 'unpushed';
        label = '↑' + sync.ahead;
        title = t('git.unpushed', { count: sync.ahead });
      } else if (sync.behind > 0) {
        state = 'behind';
        label = '↓' + sync.behind;
        title = t('git.behind', { count: sync.behind });
      } else {
        label = '✓';
        title = t('git.synced');
      }
      children.push(h('span', {
        key: 'delta',
        className: state === 'unpushed' ? 'dft-sync-ahead'
          : state === 'behind' ? 'dft-sync-behind'
            : state === 'synced' ? 'dft-sync-clean' : 'dft-sync-muted',
        title
      }, label));
      if (sync.ahead > 0 && sync.behind > 0) {
        children.push(h('span', {
          key: 'behind',
          className: 'dft-sync-behind',
          title: t('git.behind', { count: sync.behind })
        }, '↓' + sync.behind));
      }
      const summary = title + ' · ' + branch;
      return h('button', {
        type: 'button',
        className: 'dft-sync',
        'data-dft-sync': state,
        title: summary,
        'aria-label': summary,
        onClick: () => { void refreshGitStatus(root, true); },
        onContextMenu: (event) => {
          event.preventDefault();
          event.stopPropagation();
          openMenu({ x: event.clientX, y: event.clientY, root, path: root, kind: 'directory' });
        }
      }, children);
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


    // ----------------------------------------------------- host open actions
    /** Web-page extensions for which "open in browser" is meaningful. */
    const BROWSER_FILE = /\.(?:html?|xhtml|shtml|svg)$/i;
    /** Display names that identify a web browser among OS file handlers. */
    const BROWSER_APP = /(chrome|chromium|edge|firefox|brave|opera|vivaldi|safari|waterfox|librewolf|thorium|yandex|arc|browser|360|qq|浏览器)/i;

    /** Resolve the Session Remote namespace from the plugin context. */
    function getRemoteSession() {
      const ctx = pluginCtx;
      if (ctx === null) return undefined;
      let remote;
      try {
        if (typeof ctx.get === 'function') remote = ctx.get('remote');
      } catch (_error) {
        // fall through to the property access below
      }
      if (remote === undefined || remote === null) remote = ctx.remote;
      return remote === undefined || remote === null ? undefined : remote.session;
    }

    /** Read once whether the serving desktop can open Host paths. */
    function loadDesktopAvailability() {
      const session = getRemoteSession();
      if (session === undefined || typeof session.canOpenWorkspacePath !== 'function') {
        desktopAvailable = false;
        publish();
        return;
      }
      Promise.resolve()
        .then(() => session.canOpenWorkspacePath())
        .then((result) => {
          desktopAvailable = !!(result && result.ok && result.value);
          publish();
        })
        .catch(() => {
          desktopAvailable = false;
          publish();
        });
    }

    /** Send one open/reveal request through the Session Remote and surface failures. */
    async function requestOpen(key, request) {
      const session = getRemoteSession();
      if (session === undefined || typeof session.openWorkspacePath !== 'function') {
        showFeedback(key, false, 'status.unavailable');
        return false;
      }
      try {
        const result = await session.openWorkspacePath(request);
        if (result && result.ok) {
          closeMenu();
          return true;
        }
        showFeedback(key, false, request.action === 'reveal' ? 'status.revealFailed' : 'status.openFailed');
      } catch (error) {
        warn('openWorkspacePath failed', error);
        showFeedback(key, false, request.action === 'reveal' ? 'status.revealFailed' : 'status.openFailed');
      }
      return false;
    }

    /** Open a file with its default application, or a folder in the file manager. */
    function runOpen(path) {
      return requestOpen('open', { path });
    }

    /** Reveal a file or folder in the OS file manager. */
    function runReveal(path) {
      return requestOpen('reveal', { path, action: 'reveal' });
    }

    /** Open the file in DSH's own document preview tab. */
    function runPreview(root, path) {
      const sidebar = getClientService('sidebarRight');
      const address = sessionFileAddressOf(root, path);
      if (sidebar === undefined || sidebar === null || address === undefined
        || typeof sidebar.openResource !== 'function') {
        showFeedback('preview', false, 'status.previewFailed');
        return;
      }
      try {
        sidebar.openResource(address);
        closeMenu();
      } catch (error) {
        warn('openResource failed', error);
        showFeedback('preview', false, 'status.previewFailed');
      }
    }

    /** Open the selected folder (or a file's parent folder) in an OS terminal. */
    async function runTerminal(root, path, isDirectory) {
      const absolute = absoluteOf(root, path);
      const target = isDirectory ? absolute : dirnameOf(absolute);
      try {
        await callFileOp({ op: 'terminal', root: root === '' ? dirnameOf(target) : root, target });
        closeMenu();
      } catch (error) {
        warn('open terminal failed', error);
        showFeedback('terminal', false, 'status.termFailed');
      }
    }

    /** Insert the reference plus a ready-to-send AI question into the composer. */
    function runAsk(kind, relative, mention, promptText) {
      const actions = inputActions;
      if (actions === null || typeof mention !== 'string' || mention === '') {
        showFeedback('ai', false);
        return;
      }
      const outcome = addToComposer(kind, relative, mention);
      if (outcome === false) {
        showFeedback('ai', false);
        return;
      }
      try {
        if (typeof actions.captureInsertion === 'function' && typeof actions.insertText === 'function') {
          const span = actions.captureInsertion();
          if (span !== undefined) actions.insertText(' ' + promptText, span);
        }
      } catch (error) {
        warn('insert AI prompt failed', error);
      }
      closeMenu();
    }

    /** Open the inline form for create/rename/delete. */
    function openFilePrompt(mode, root, path, kind) {
      const absolute = absoluteOf(root, path);
      const name = labelOf(kind, relativeOf(root, path)).replace(/\/+$/, '');
      if (mode === 'newFile' || mode === 'newFolder') {
        const parent = kind === 'directory' ? absolute : dirnameOf(absolute);
        openPrompt(mode, {
          root,
          parentPath: parent,
          kind,
          title: t(mode === 'newFile' ? 'form.newFileTitle' : 'form.newFolderTitle'),
          desc: t('menu.createIn', { name: name === '' ? root : name }),
          busy: false
        });
      } else if (mode === 'rename') {
        openPrompt('rename', { root, targetPath: absolute, kind, title: t('form.renameTitle'), desc: '', value: name, busy: false });
      } else if (mode === 'delete') {
        openPrompt('delete', {
          root,
          targetPath: absolute,
          kind,
          title: t('form.deleteTitle'),
          desc: t(kind === 'directory' ? 'form.deleteFolder' : 'form.deleteFile', { name }),
          busy: false
        });
      }
    }

    /** Submit the inline create/rename/delete form to the host route. */
    async function submitPrompt() {
      const menu = state.menu;
      if (menu === null || menu.view !== 'prompt' || menu.prompt === null) return;
      const prompt = menu.prompt;
      if (prompt.busy === true) return;
      let name = '';
      if (prompt.mode !== 'delete') {
        name = String(prompt.value === undefined ? '' : prompt.value).trim();
        if (name === '') {
          setPromptError(t('status.nameRequired'));
          return;
        }
      }
      const setBusy = (busy) => {
        if (state.menu === null || state.menu.view !== 'prompt' || state.menu.prompt === null) return;
        state = { menu: { ...state.menu, prompt: { ...state.menu.prompt, busy } }, feedback: state.feedback };
        publish();
      };
      setBusy(true);
      try {
        if (prompt.mode === 'delete') {
          await callFileOp({ op: 'trash', root: prompt.root, target: prompt.targetPath });
        } else if (prompt.mode === 'rename') {
          await callFileOp({ op: 'rename', root: prompt.root, target: prompt.targetPath, name });
        } else {
          await callFileOp({
            op: prompt.mode === 'newFile' ? 'newFile' : 'mkdir',
            root: prompt.root,
            parent: prompt.parentPath,
            name
          });
        }
        clearSelection();
        closeMenu();
        void refreshGitStatus(prompt.root, true);
      } catch (error) {
        setBusy(false);
        setPromptError(String(error && error.message ? error.message : error));
      }
    }

    /** List the file's OS handlers, or null when the query fails. */
    async function queryApplications(path) {
      const session = getRemoteSession();
      if (session === undefined || typeof session.workspacePathApplications !== 'function') return null;
      try {
        const result = await session.workspacePathApplications({ path });
        return result && result.ok && Array.isArray(result.value) ? result.value : null;
      } catch (error) {
        warn('workspacePathApplications failed', error);
        return null;
      }
    }

    /** Open a web page file in a detected browser, falling back to the system default. */
    async function runBrowserOpen(path) {
      const apps = await queryApplications(path);
      const browser = Array.isArray(apps)
        ? (apps.find((app) => app && typeof app.name === 'string' && app.default && BROWSER_APP.test(app.name))
          || apps.find((app) => app && typeof app.name === 'string' && BROWSER_APP.test(app.name)))
        : undefined;
      if (browser !== undefined && browser !== null) {
        return requestOpen('browser', { path, application: browser.id });
      }
      return requestOpen('browser', { path });
    }

    /**
     * Console diagnostics for the chip-insert route; keeps fallbacks explainable.
     */
    function warn(reason, detail) {
      console.warn('[dsh-file-tree] ' + reason, detail === undefined ? '' : detail);
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

    /** Add every entry of a multi-selection to the composer. */
    function runAddMany(entries) {
      const actions = inputActions;
      if (actions === null || !Array.isArray(entries) || entries.length === 0) {
        showFeedback('multiAdd', false);
        return;
      }
      let chips = 0;
      let texts = 0;
      const failed = [];
      for (const entry of entries) {
        const relative = relativeOf(entry.root, entry.path);
        const mention = mentionOf(entry.kind, relative);
        if (mention === undefined) continue;
        const outcome = addToComposer(entry.kind, relative, mention);
        if (outcome === 'chip') chips += 1;
        else if (outcome === 'text') texts += 1;
        else failed.push(mention);
      }
      if (chips === 0 && texts === 0 && failed.length === 0) {
        showFeedback('multiAdd', false);
        return;
      }
      if (failed.length > 0 && typeof actions.insertText === 'function') {
        try {
          const span = typeof actions.captureInsertion === 'function' ? actions.captureInsertion() : undefined;
          actions.insertText(' ' + failed.join(' ') + ' ', span);
        } catch (error) {
          warn('batch fallback insert failed', error);
        }
      }
      clearSelection();
      closeMenu();
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
        if (typeof cwdValue === 'string' && cwdValue !== '' && cwdValue !== sessionCwd) {
          sessionCwd = cwdValue;
          // The header pill is keyed by this root: repaint it and read the new
          // workspace's branch right away instead of waiting for the next poll.
          repaintGit();
          void refreshGitStatus(cwdValue, true);
        }
      });
      return null;
    }

    /** The floating context menu rendered in the frame-wide overlay layer. */
    function FileTreeContextMenu() {
      const current = React.useSyncExternalStore(subscribe, snapshot, snapshot);
      const panelRef = React.useRef(null);
      const menuState = current.menu;
      const open = menuState !== null;
      const gitMenuRoot = open && menuState !== null
        ? (Array.isArray(menuState.multi)
          ? (menuState.multi.length > 0 && menuState.multi.every((entry) => gitKey(entry.root) === gitKey(menuState.multi[0].root))
            ? menuState.multi[0].root
            : null)
          : menuState.root)
        : null;

      // Refresh the branch/changed-path reading whenever the menu opens; the
      // visible tree also polls on its own, but the menu should never show a
      // reading older than the right-click that opened it.
      React.useEffect(() => {
        if (gitMenuRoot !== null) void refreshGitStatus(gitMenuRoot, true);
      }, [open, gitMenuRoot]);

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
        const promptMode = menuState.view === 'prompt' && menuState.prompt !== null ? menuState.prompt.mode : null;
        const input = panel !== null && promptMode !== null && promptMode !== 'delete'
          ? panel.querySelector('input.dft-input')
          : null;
        if (input !== null) {
          input.focus();
          input.select();
        } else {
          const first = panel !== null ? panel.querySelector('button') : null;
          if (first !== null) first.focus();
        }
        return undefined;
      }, [open, menuState === null ? null : menuState.view, menuState === null || menuState.prompt === null ? null : menuState.prompt.mode]);

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
      const absolute = absoluteOf(menuState.root, menuState.path);
      const mention = mentionOf(kind, relative);
      const displayName = labelOf(kind, relative);
      const isDirectory = kind === 'directory';
      const browserFile = !isDirectory && BROWSER_FILE.test(menuState.path);
      const canUseDesktop = desktopAvailable !== false;

      const item = (key, label, run, options) => {
        const mine = current.feedback !== null && current.feedback.key === key;
        const text = mine
          ? (current.feedback.ok ? t(current.feedback.textKey || 'status.copied') : t(current.feedback.textKey || 'status.failed'))
          : label;
        const children = [];
        if (options !== undefined && typeof options.icon === 'string' && options.icon.startsWith('data:')) {
          children.push(h('img', { key: 'icon', className: 'dft-icon', src: options.icon, alt: '' }));
        }
        children.push(h('span', { key: 'label', className: 'dft-item-label' }, text));
        if (options !== undefined && typeof options.hint === 'string' && options.hint !== '') {
          children.push(h('span', { key: 'hint', className: 'dft-hint' }, options.hint));
        }
        return h('button', {
          key,
          type: 'button',
          role: 'menuitem',
          className: 'dft-item',
          disabled: options !== undefined && options.disabled === true ? true : undefined,
          'data-state': mine ? (current.feedback.ok ? 'copied' : 'failed') : undefined,
          onClick: run
        }, children);
      };

      const note = (key, text) => h('div', { key, className: 'dft-note', role: 'none' }, text);

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

      const panel = (children) => h('div', {
        ref: panelRef,
        role: 'menu',
        'aria-label': t('menu.label'),
        className: 'dft-panel',
        style: { left: position.left, top: position.top },
        onKeyDown
      }, children);

      // Inline create/rename/delete confirmation form.
      if (menuState.view === 'prompt') {
        const prompt = menuState.prompt;
        if (prompt === null) return null;
        const submit = (event) => {
          if (event !== undefined && event !== null) event.preventDefault();
          void submitPrompt();
        };
        const fields = [h('div', { key: 'title', className: 'dft-form-title' }, prompt.title)];
        if (typeof prompt.desc === 'string' && prompt.desc !== '') {
          fields.push(h('div', { key: 'desc', className: 'dft-form-desc' }, prompt.desc));
        }
        if (prompt.mode !== 'delete') {
          fields.push(h('input', {
            key: 'input',
            className: 'dft-input',
            value: prompt.value === undefined ? '' : prompt.value,
            placeholder: t('form.namePlaceholder'),
            onChange: (event) => setPromptValue(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void submitPrompt();
              }
            }
          }));
        }
        if (typeof prompt.error === 'string' && prompt.error !== '') {
          fields.push(h('div', { key: 'error', className: 'dft-form-error' }, prompt.error));
        }
        fields.push(h('div', { key: 'actions', className: 'dft-form-actions' }, [
          h('button', { key: 'cancel', type: 'button', className: 'dft-btn', disabled: prompt.busy === true, onClick: closeMenu }, t('form.cancel')),
          h('button', { key: 'ok', type: 'submit', className: 'dft-btn ' + (prompt.mode === 'delete' ? 'dft-btn-danger' : 'dft-btn-primary'), disabled: prompt.busy === true }, prompt.mode === 'delete' ? t('form.deleteTitle') : t('form.confirm'))
        ]));
        return panel([h('form', { key: 'form', className: 'dft-form', onSubmit: submit }, fields)]);
      }

      // Multi-selection menu: batch add and copy actions.
      if (Array.isArray(menuState.multi) && menuState.multi.length > 1) {
        const entries = menuState.multi;
        const count = entries.length;
        const mentions = entries
          .map((entry) => mentionOf(entry.kind, relativeOf(entry.root, entry.path)))
          .filter((mention) => mention !== undefined);
        const multiGit = gitMenuRoot === null ? null : gitInfoNode(gitMenuRoot);
        return panel([
          ...(multiGit === null ? [] : [multiGit, h('div', { key: 'sep-git', role: 'separator', className: 'dft-sep' })]),
          note('multi-count', t('menu.selectedCount', { count })),
          item('multiAdd', t('menu.addSelected', { count }), () => runAddMany(entries)),
          item('multiCopy', t('menu.copySelected'), () => runCopy('multiCopy', entries.map((entry) => absoluteOf(entry.root, entry.path)).join('\n'))),
          item('multiMention', t('menu.copyMention'), () => runCopy('multiMention', mentions.join(' '))),
          h('div', { key: 'sep-multi', role: 'separator', className: 'dft-sep' }),
          item('clearSelection', t('menu.clearSelection'), () => { clearSelection(); closeMenu(); })
        ]);
      }

      const gitNodes = [];
      if (!Array.isArray(menuState.multi)) {
        const summary = gitInfoNode(menuState.root);
        if (summary !== null) gitNodes.push(summary);
        const entry = gitEntryNode(menuState.root, menuState.path, kind);
        if (entry !== null) gitNodes.push(entry);
        if (gitNodes.length > 0) gitNodes.push(h('div', { key: 'sep-git', role: 'separator', className: 'dft-sep' }));
      }

      const children = [
        ...gitNodes,
        item('add', t('menu.add'), () => runAdd(kind, relative, mention)),
        item('mention', t('menu.copyMention'), () => runCopy('mention', mention))
      ];

      // AI actions need a valid file mention, so folders are excluded.
      if (!isDirectory && mention !== undefined) {
        children.push(h('div', { key: 'sep-ai', role: 'separator', className: 'dft-sep' }));
        children.push(item('aiSummary', t('menu.aiSummary'), () => runAsk(kind, relative, mention, t('ai.summaryPrompt'))));
        children.push(item('aiExplain', t('menu.aiExplain'), () => runAsk(kind, relative, mention, t('ai.explainPrompt'))));
      }

      if (canUseDesktop) {
        children.push(h('div', { key: 'sep-open', role: 'separator', className: 'dft-sep' }));
        if (!isDirectory) {
          children.push(item('preview', t('menu.preview'), () => runPreview(menuState.root, menuState.path)));
        }
        children.push(item('open', isDirectory ? t('menu.openFolder') : t('menu.open'), () => runOpen(absolute)));
        children.push(item('reveal', t('menu.reveal'), () => runReveal(absolute)));
        if (browserFile) {
          children.push(item('browser', t('menu.browser'), () => runBrowserOpen(absolute)));
        }
        children.push(item('terminal', isDirectory ? t('menu.terminal') : t('menu.terminalHere'), () => runTerminal(menuState.root, menuState.path, isDirectory)));
      }

      children.push(h('div', { key: 'sep-file', role: 'separator', className: 'dft-sep' }));
      children.push(item('newFile', t('menu.newFile'), () => openFilePrompt('newFile', menuState.root, menuState.path, kind)));
      children.push(item('newFolder', t('menu.newFolder'), () => openFilePrompt('newFolder', menuState.root, menuState.path, kind)));
      children.push(item('rename', t('menu.rename'), () => openFilePrompt('rename', menuState.root, menuState.path, kind)));
      children.push(item('delete', t('menu.delete'), () => openFilePrompt('delete', menuState.root, menuState.path, kind)));

      children.push(h('div', { key: 'sep-copy', role: 'separator', className: 'dft-sep' }));
      children.push(item('fileUrl', t('menu.copyFileUrl'), () => runCopy('fileUrl', fileUrlOf(absolute))));
      children.push(item('markdown', t('menu.copyMarkdown'), () => runCopy('markdown', markdownLinkOf(kind, relative, absolute, displayName))));
      children.push(item('absolute', t('menu.copyAbsolute'), () => runCopy('absolute', absolute)));
      children.push(item('relative', t('menu.copyRelative'), () => runCopy('relative', relative)));
      children.push(item('name', t('menu.copyName'), () => runCopy('name', displayName)));
      return panel(children);
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
      ctx.effect(() => insertCss(CSS), 'dsh-file-tree: stylesheet');
      if (ctx.locale) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-file-tree: dictionaries');
        t = ctx.locale.bind(NS);
      }
      ctx.effect(startGitWatcher, 'dsh-file-tree: git status watcher');
      // Discover whether this deployment can hand paths to the desktop before
      // deciding to show the open/reveal group.
      loadDesktopAvailability();

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
        let multi;
        const row = target.closest('li[data-files-entry][data-files-path]');
        if (row !== null) {
          const entry = fileTreeEntry(row);
          if (entry !== null && selection.length > 1 && isEntrySelected(entry)) multi = selection.slice();
          else if (selection.length > 0) clearSelection();
        }
        openMenu({
          x: event.clientX,
          y: event.clientY,
          root: hit.root,
          path: hit.path,
          kind: hit.kind,
          multi
        });
      };
      document.addEventListener('contextmenu', onContextMenu, true);
      ctx.effect(() => () => document.removeEventListener('contextmenu', onContextMenu, true),
        'dsh-file-tree: listener');

      // Ctrl/Cmd-click toggles, Shift-click selects a visible range. A plain
      // click anywhere clears the selection and keeps the tree's own behavior.
      const onRowClick = (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('.dft-panel') !== null) return;
        const row = target.closest('li[data-files-entry][data-files-path]');
        if (row === null) {
          if (selection.length > 0) clearSelection();
          return;
        }
        const entry = fileTreeEntry(row);
        if (entry === null) return;
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          event.stopPropagation();
          toggleSelection(entry);
          return;
        }
        if (event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          selectRange(entry);
          return;
        }
        if (selection.length > 0) clearSelection();
      };
      document.addEventListener('click', onRowClick, true);
      ctx.effect(() => () => document.removeEventListener('click', onRowClick, true),
        'dsh-file-tree: selection click');
      ctx.effect(installSelectionObserver, 'dsh-file-tree: selection observer');

      // Invisible bridges that capture the composer's InputActions from the
      // standard provide channel, from the file tab and from the composer row.
      const registration = (name, component, order, id) => () => ctx.slots.register({ name, id: id === undefined ? 'dsh-file-tree' : id, order }, component);
      ctx.slots.inject('sidebar.right.tab.files.actions', registration('sidebar.right.tab.files.actions', GitSyncPill, 40, 'dsh-file-tree.sync'));
      ctx.slots.inject('sidebar.right.tab.files.actions', registration('sidebar.right.tab.files.actions', ComposerBridge, 90));
      ctx.slots.inject('conversation.input.left', registration('conversation.input.left', ComposerBridge, 90));
      ctx.slots.inject('shell.overlay', registration('shell.overlay', FileTreeContextMenu, 60));
    }

    return { inject: ['slots', 'locale', 'remote', 'remote.session', 'sidebarRight'], apply };
  }
});
