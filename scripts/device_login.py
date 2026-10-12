#!/usr/bin/env python3
"""用 GitHub 官方的设备码流程（Device Flow）完成登录，等价于 gh auth login --web。

为什么不用 gh 自带的交互式登录：当前环境禁止分配伪终端（openpty: Operation not permitted），
gh 的交互界面起不来。设备码流程只需要普通 HTTP 请求，因此可以直接实现。

流程：
  1. 向 github.com/login/device/code 申请一次性代码 → 打印给你
  2. 你在浏览器打开链接、输入代码并授权
  3. 本脚本轮询换取访问令牌，写入 GH_CONFIG_DIR/hosts.yml（gh 能直接识别）

用法：
  GH_CONFIG_DIR=<目录> python3 scripts/device_login.py
"""
import json, os, sys, time, urllib.parse, urllib.request, urllib.error

# GitHub CLI 的公开 client id（设备码流程需要，不是密钥；授权页会显示为 GitHub CLI）
CLIENT_ID = "178c6fc778ccc68e1d6a"
# repo=建仓库/推送，workflow=能推送 .github/workflows 下的文件，read:org=读取组织信息
SCOPES = "repo workflow read:org"
UA = {"User-Agent": "gh-device-flow/1.0", "Accept": "application/json"}


def post(url, data):
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=body, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def get(url, token):
    req = urllib.request.Request(url, headers={**UA, "Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def main():
    cfg_dir = os.environ.get("GH_CONFIG_DIR") or os.path.expanduser("~/.config/gh")
    os.makedirs(cfg_dir, exist_ok=True)

    print("正在向 GitHub 申请一次性代码…", flush=True)
    d = post("https://github.com/login/device/code", {"client_id": CLIENT_ID, "scope": SCOPES})
    if "user_code" not in d:
        print("申请失败：", d, flush=True)
        return 1

    code = d["user_code"]
    uri = d.get("verification_uri", "https://github.com/login/device")
    interval = int(d.get("interval", 5))
    expires = int(d.get("expires_in", 900))

    print("", flush=True)
    print("=" * 56, flush=True)
    print(f"  一次性代码：{code}", flush=True)
    print(f"  授权链接：  {uri}", flush=True)
    print(f"  有效期：    {expires // 60} 分钟", flush=True)
    print("=" * 56, flush=True)
    print("请在浏览器打开链接、输入上面的代码并点击 Authorize。", flush=True)
    print("（本脚本会一直等待，授权成功后自动完成）", flush=True)
    print("", flush=True)
    print(f"CODE={code}", flush=True)
    print(f"URI={uri}", flush=True)

    deadline = time.time() + expires - 15
    while time.time() < deadline:
        time.sleep(interval)
        try:
            r = post("https://github.com/login/oauth/access_token", {
                "client_id": CLIENT_ID,
                "device_code": d["device_code"],
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            })
        except urllib.error.HTTPError as e:
            print(f"  轮询出错（{e.code}），继续等待…", flush=True)
            continue
        err = r.get("error")
        if err == "authorization_pending":
            continue
        if err == "slow_down":
            interval += 5
            continue
        if err in ("expired_token", "access_denied"):
            print(f"❌ 授权失败：{err}（请重新运行本脚本）", flush=True)
            return 1
        token = r.get("access_token")
        if not token:
            print(f"  未预期的返回，继续等待… {r}", flush=True)
            continue

        user = get("https://api.github.com/user", token)
        login = user.get("login", "unknown")
        print(f"✅ 授权成功！账号：{login}", flush=True)

        hosts = os.path.join(cfg_dir, "hosts.yml")
        with open(hosts, "w", encoding="utf-8") as f:
            f.write("github.com:\n")
            f.write(f"    user: {login}\n")
            f.write(f"    oauth_token: {token}\n")
            f.write("    git_protocol: https\n")
        os.chmod(hosts, 0o600)
        print(f"   凭据已写入：{hosts}（仅本机可读，权限 600）", flush=True)
        print(f"LOGIN={login}", flush=True)
        print("TOKEN_SAVED=1", flush=True)
        return 0

    print("❌ 代码已过期，未完成授权。请重新运行本脚本。", flush=True)
    return 1


if __name__ == "__main__":
    sys.exit(main())
