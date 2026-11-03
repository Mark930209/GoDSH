/**
 * 模板客户端插件：在右下角浮层显示一个小徽标，证明 bundle 已加载。
 * 从这里开始改：把 Badge 换成你的 UI，或换注册到别的插槽（见 docs/plugin-dev-guide.md）。
 */
window.__ModuleLoader__.load({
  id: '@local/__PLUGIN__',
  factory(require) {
    const React = require('react');

    function Badge() {
      return React.createElement(
        'div',
        {
          style: {
            position: 'fixed',
            right: 14,
            bottom: 14,
            zIndex: 60,
            padding: '4px 10px',
            borderRadius: 999,
            background: 'rgba(37, 99, 235, 0.92)',
            color: '#fff',
            font: '12px/1.4 system-ui, sans-serif',
            pointerEvents: 'none',
            userSelect: 'none'
          }
        },
        '__PLUGIN__ 已加载'
      );
    }

    function apply(ctx) {
      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register({ name: 'shell.overlay', id: '__PLUGIN__.badge', order: 90 }, Badge)
      );
    }

    return { inject: ['slots'], apply };
  }
});
