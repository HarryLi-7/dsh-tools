# DSH 插件项目合规检查清单

> **锚定版本**：以下条目基于 2026-08-15 的官方文档 + 本地 `@deepseek-ai/dsh 0.1.0-rc.6` 实测。
> harness 是开发者预览版，官方文档和规则可能随时变更（破坏性变更预期内）。
>
> **复核机制**：每次 DSH 升级、官方文档更新，或开始新的插件项目前，重新拉取官方文档核对本清单；
> 核对后更新下方的复核记录。清单条目失效时标注"已失效"并写明新规则，而不是悄悄删掉。

依据官方文档：
- 打包与安装：https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md
- 中文 README：https://github.com/deepseek-ai/deepseek-harness/blob/master/README.zh.md

## 复核记录

| 日期 | 核对依据 | 结论 |
|---|---|---|
| 2026-08-15 | dsh 0.1.0-rc.6 + publish.md / README.zh.md master | 清单建立，全部条目经实测验证 |

## 打包（bundle 格式）

- [ ] `package.json` 声明 `dsh.bundle: { "patch": "./cordis.patch.yml" }`
- [ ] 包内自带 `cordis.patch.yml`（insert/覆盖插件行），随包分发
- [ ] `files` 字段列出分发文件（`lib`、`cordis.patch.yml`）
- [ ] 有 client 端时声明 `dsh.client: { inject: [...], platform: "web" }`（官方 publish.md 未覆盖 client 机制，以 dsh-update-checker 为参考实现）
- [ ] `main`/`exports` 正确（`.`, `./client`, `./package.json`）
- [ ] `peerDependencies` 只声明服务定义包（`@deepseek-ai/*`），运行时从 profile 解析，不装重复依赖

## 安装与分发

- [ ] 用官方命令安装/分发：`dsh plugin --profile <名> add <路径>`（需要 pnpm）
- [ ] 安装后 `dsh --profile <名> --dump-config` 能看到 `# == <包名>` 层
- [ ] profile 的 `cordis.patch.yml` 只放用户个人覆盖，不放插件挂载
- [ ] 仓库加 `dsh-plugin` 话题便于发现（官方 README 推荐）
- [ ] 包名用 `dsh-` 前缀（如 `dsh-hello-plugin`）

## 层顺序规则

1. bundles（按 `dsh.profile.bundles` 列表顺序）
2. profile 的 `cordis.patch.yml`
3. `$DSH_HOME/cordis.patch.yml`（机器级）
4. `--patch <path>` 覆盖（argv 顺序，最后胜出）

- [ ] 覆盖某行 = 整行替换 `config`（不是深合并）——重写时需带上全部键
- [ ] 用户层永远能覆盖 bundle 层（设计默认值时应假设用户会覆盖）

## 生效与验证

- [ ] harness 只热载 `cordis.patch.yml`，**不监听 package.json** —— 改 bundle 结构必须重启 harness 才生效
- [ ] 改 host 端 lib 代码：ESM 模块缓存，重启才生效
- [ ] 改 client 端代码：文件实时服务，刷新页面即可
- [ ] 发布/升级前跑 `--dump-config` 验证组合；有测试则跑测试（参考 dsh-update-checker 的纯逻辑 + SSR 冒烟测试）

## 通用

- [ ] 无密钥硬编码（凭证走 DSH credentials 系统）
- [ ] 磁盘足迹最小化：host 纯内存；client 持久化只用 localStorage 单键
- [ ] 网络失败静默降级，不崩、不刷屏
- [ ] harness 是开发者预览版，可能破坏性变更——跟随 `@deepseek-ai/dsh` rc 版本节奏
