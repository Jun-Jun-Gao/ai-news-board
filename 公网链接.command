#!/bin/bash
# 双击即可：生成一个临时公网 https 链接（Cloudflare 隧道），任何人可打开
cd "$(dirname "$0")"
./scripts/share_public.sh
