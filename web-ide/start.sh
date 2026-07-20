#!/usr/bin/env bash
# web-ide 本地启动脚本
# 用法:
#   ./start.sh              # mock 回显模式（默认，端口 3001）
#   VTE_API_KEY=xxx VTE_MODEL=gpt-4o ./start.sh   # 接真实模型
#
# 说明: 请在你自己的终端里运行本脚本。进程会归属你的终端会话，
# 一直常驻，不受 AI 助手对话轮次影响。Ctrl-C 停止。

set -e
cd "$(dirname "$0")"

# 定位受管 node 运行时：避免写死用户名路径（脚本在不同机器/用户间可移植）。
# 优先使用 $HOME 下的受管 22.22.2；缺失时回退到 PATH 里的 node。
NODE="$HOME/.workbuddy/binaries/node/versions/22.22.2/bin/node"
if [ ! -x "$NODE" ]; then
  NODE="$(command -v node || true)"
fi
if [ -z "$NODE" ]; then
  echo "✗ 找不到可用的 node 运行时，请先安装 Node.js" >&2
  exit 1
fi
PORT="${VTE_PORT:-3001}"

# 加载 .env 文件（若存在）。.env 里每行 KEY=VALUE 会自动变成环境变量，
# 因此也可在 .env 中设置 VTE_MOCK / VTE_API_KEY / VTE_MODEL 等。
if [ -f .env ]; then
  set -a
  source .env
  set +a
  echo "▶ 已从 .env 加载环境变量"
fi

# 清掉可能占用端口的旧进程
pids=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
[ -n "$pids" ] && { echo "清理端口 $PORT 上的旧进程: $pids"; kill -9 $pids 2>/dev/null || true; sleep 1; }

# 确定运行模式：
#   1. 已显式 export VTE_MOCK → 尊重它
#   2. .env 中设了 VTE_MOCK → 已在上方 source，直接使用
#   3. 有 VTE_API_KEY → 真实模式；否则 → mock 回显模式
if [ -z "$VTE_MOCK" ]; then
  if [ -n "$VTE_API_KEY" ]; then
    export VTE_MOCK=0
  else
    export VTE_MOCK=1
  fi
fi

if [ "$VTE_MOCK" = "1" ]; then
  echo "▶ 以 mock 回显模式启动"
else
  echo "▶ 以真实模型模式启动  model=${VTE_MODEL:-gpt-4o-mini}"
fi

export VTE_PORT="$PORT"
echo "▶ 访问地址: http://localhost:$PORT"
echo "▶ Ctrl-C 停止"
echo "────────────────────────────────────────"

# 前台运行，日志直接打印到终端
exec "$NODE" ./node_modules/tsx/dist/cli.mjs server/index.ts
