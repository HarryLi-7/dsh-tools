# 工作区指令（DSH 自动注入，适用于本工作区的所有会话）

本工作区涉及 DeepSeek Harness (DSH) 的开发/调整任务时，必须遵守：

1. **合规清单**：先阅读 `DSH插件合规检查清单.md`（本工作区根目录），按其规则开发、打包、安装插件。
2. **官方文档为准**：开始任务前，若官方文档可能已更新（DSH 升级、规则变更），重新拉取官方文档核对清单，并更新清单中的"复核记录"表。官方文档：
   - 打包与安装：https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md
   - 中文 README：https://github.com/deepseek-ai/deepseek-harness/blob/master/README.zh.md
3. **关键实操规则**（详见清单）：
   - 插件必须做成官方 bundle 格式（`dsh.bundle` + 包内 `cordis.patch.yml`），用 `dsh plugin --profile <名> add` 安装
   - 改 host 端代码需重启 harness 才生效；改 client 端刷新页面即可；`package.json` 变更不热载
   - 验证用 `dsh --profile <名> --dump-config`
4. **本机约定**：harness 运行于 127.0.0.1:3080，运行进程不可重启（会中断当前会话）；插件代码位于 `~/.dsh/profiles/packages/`。
