#!/bin/bash
# restart-fix-session.sh — 路径 A 执行器：停止 harness → 修复会话日志 → 提示重启
#
# 用法（在任意终端运行）：
#   bash "/Users/harry/Documents/DeepSeek Herness/restart-fix-session.sh"
#
# 它会：
#   1. 通过端口 3080 定位并优雅停止运行中的 harness（先 SIGTERM，15 秒后未退则 SIGKILL）
#      —— 注意：这也会断开当前所有会话（包括正在对话的窗口）。
#   2. 运行 fix-session-image.mjs：备份原日志并把会话里的图片块改写为文本占位
#      （脚本自带防并发守卫：若 harness 没停干净会自动中止）。
#   3. 提示你手动重启 harness（用你平时启动它的命令）。
#
# 回滚：脚本会在会话目录留下 session.jsonl.zstd.bak-<时间戳>，
#   需要回退时先停止 harness，把备份文件改回 session.jsonl.zstd 再重启即可。
set -euo pipefail

echo "→ 脚本启动（PID $$）…"

PORT=3080
FIX_SCRIPT="/Users/harry/Documents/DeepSeek Herness/fix-session-image.mjs"

pids_on_port() {
	lsof -ti :"$PORT" 2>/dev/null || true
}

PID=$(pids_on_port)
if [ -n "$PID" ]; then
	echo "→ 检测到 harness 正在监听 :$PORT（PID: $(echo "$PID" | tr '\n' ' ')），发送 SIGTERM 优雅停止…"
	kill $PID || true
	for ((i = 0; i < 15; i++)); do
		if [ -z "$(pids_on_port)" ]; then break; fi
		sleep 1
	done
	if [ -n "$(pids_on_port)" ]; then
		echo "→ 15 秒未退出，发送 SIGKILL…"
		kill -9 $(pids_on_port) || true
		sleep 1
	fi
else
	echo "→ 端口 :$PORT 没有监听（harness 未运行或已停止），直接进入修复。"
fi

# 兜底：若 lsof 不可用或还有残留进程，按命令行特征再杀一次
if [ -n "$(pids_on_port)" ]; then
	echo "→ 仍有残留监听进程，尝试 pkill 兜底…"
	pkill -f '1e7f6d9597241db0' 2>/dev/null || true
	sleep 1
fi
if [ -n "$(pids_on_port)" ]; then
	echo "✗ 端口 :$PORT 仍被占用，请手动确认 harness 进程已停止后再重试。"
	exit 1
fi
echo "→ harness 已停止。"

echo "→ 运行日志修复脚本…"
node "$FIX_SCRIPT"

echo
echo "✓ 完成。现在用你平时启动 harness 的命令重启它（例如：dsh web --profile web）。"
echo "  重启后："
echo "  1. 打开该会话，若模型停在智谱 GLM，用模型选择器切回 DeepSeek（deepseek-v4-flash）——"
echo "     此时会话已无图片，切换会被允许；"
echo "  2. 发一条消息验证 DeepSeek 能正常回复；"
echo "  3. 若担心上下文过长，可再运行一次 /compact（此时摘要走 DeepSeek，能正常读文本历史）。"
