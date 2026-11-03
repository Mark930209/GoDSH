# __PLUGIN__

由 `templates/plugin-bundle` 生成的 DSH 插件骨架（v0.1.0）。

- 客户端逻辑：`client.js`（当前在右下角浮层渲染一个徽标）
- 修改 `client.js` 的 `Badge` 组件或换插槽注册即为你的插件。

## 开发

```powershell
node --check client.js
# 安装：plugin_manager install_bundle target=<本目录绝对路径>
# 改完重启 DeepSeek Harness；只改了 client.js 无需重装
```

## 待办

- [ ] 改 `locale/*.json` 的标题/描述（市场展示用）
- [ ] 换 `icon.svg`
- [ ] 更新 CHANGELOG.md
- [ ] 加入仓库 README 的插件清单
