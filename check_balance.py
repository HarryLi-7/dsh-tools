#!/usr/bin/env python3
import urllib.request
import json
import os
import sys
import socket

socket.setdefaulttimeout(8)
cred = os.path.expanduser("~/.dsh/.credentials.yaml")
key = None
try:
    with open(cred) as f:
        for line in f:
            if line.startswith("DEEPSEEK_API_KEY:"):
                key = line.split(":", 1)[1].strip()
                break
except Exception as e:
    print("ERROR: read_credentials", e)
    sys.exit(1)

if not key:
    print("ERROR: no_api_key")
    sys.exit(1)

req = urllib.request.Request(
    "https://api.deepseek.com/user/balance",
    headers={"Authorization": "Bearer " + key, "Accept": "application/json"},
)
try:
    with urllib.request.urlopen(req, timeout=8) as r:
        d = json.load(r)
    b = d["balance_infos"][0]
    top = b["topped_up_balance"]
    grant = b["granted_balance"]
    print(f"充值余额={top}")
    print(f"赠送={grant}")
except Exception as e:
    print("ERROR:", e)
    sys.exit(1)
