# dsh-tools

DeepSeek Harness (DSH) 小工具集:余额查询 + 界面余额小部件。

## 组件

| 文件/目录 | 说明 |
|---|---|
| `check_balance.py` | 命令行余额查询脚本,输出 `充值余额` / `赠送` 两行。读取 `~/.dsh/.credentials.yaml` 中的 `DEEPSEEK_API_KEY`。 |
| `dsh-balance-widget/` | DSH Web GUI 余额小部件(Cordis 客户端插件):输入栏行内左侧显示余额,每分钟自动刷新。 |
| `sync.sh` | 一键把 `~/.dsh` 中安装的插件同步回本仓库并推送 GitHub。 |

## dsh-balance-widget 安装方法

**方式一(官方 `dsh plugin`,推荐):** 包已声明 `dsh.bundle` 并自带 patch 层,可直接用官方命令安装:

```bash
dsh plugin --profile web add /path/to/dsh-balance-widget
```

重启 DSH(`dsh web`)后生效。

**方式二(手动,无需 pnpm):**

1. 把 `dsh-balance-widget` 目录复制到 `~/.dsh/profiles/packages/`:

   ```bash
   cp -R dsh-balance-widget ~/.dsh/profiles/packages/
   ```

2. 建立符号链接,让 DSH 加载器能解析到它:

   ```bash
   ln -s ../packages/dsh-balance-widget ~/.dsh/profiles/node_modules/dsh-balance-widget
   ```

3. 在 `~/.dsh/profiles/web/cordis.patch.yml` 中追加:

   ```yaml
   - insert:
       - id: balance-widget
         name: dsh-balance-widget
   ```

4. 重启 DSH(`dsh web`),浏览器强制刷新(`Cmd+Shift+R`)。

## 小部件行为

- 显示 `余额:X.XX CNY`;当赠送金额 > 0 时自动切换为 `余额 · 充值 · 赠送` 单行紧凑格式
- 每分钟刷新;接口失败后 10 秒快速重试,恢复后自动回到正常节奏
- **点击芯片 → 新标签打开 DeepSeek 官方余额页**(https://platform.deepseek.com/balance),需要浏览器已登录平台账号
- **低余额告警**:余额 < ¥5 文字变橙色,< ¥2 变红色
- 账户不可用时显示红色 `⚠️ 账户状态异常`
- 接口连续失败 3 次后显示橙色 `⚠️ 余额接口无法访问,正在重试`,恢复后自动消失
- API key 只留在 host 侧,通过 DSH 的 credentials 服务读取,浏览器端不含任何密钥
- 零落盘:不写日志、不写缓存文件

## 本地修改后同步到 GitHub

```bash
./sync.sh
```

## 安全说明

所有代码不含任何密钥。API key 运行时从 `~/.dsh/.credentials.yaml` 读取,请勿将该文件上传到任何仓库。
