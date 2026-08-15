#!/usr/bin/env bash
# 把 ~/.dsh 里安装的 dsh-balance-widget 插件同步到本仓库并推送
set -euo pipefail
WS="$(cd "$(dirname "$0")" && pwd)"
SRC="$HOME/.dsh/profiles/packages/dsh-balance-widget"
if [ ! -f "$SRC/package.json" ]; then echo "找不到插件源: $SRC"; exit 1; fi
cp "$SRC/package.json" "$WS/dsh-balance-widget/"
cp "$SRC/lib/index.js" "$SRC/lib/client.js" "$WS/dsh-balance-widget/lib/"
cd "$WS"
git add -A
if git diff --cached --quiet; then echo "没有变更,无需同步"; exit 0; fi
git commit -m "sync dsh-balance-widget $(date '+%Y-%m-%d %H:%M')"
git push
echo "已同步并推送 ✓"
