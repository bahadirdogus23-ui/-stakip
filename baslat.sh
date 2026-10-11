#!/bin/sh
# Kırsal Yol Bakım sunucusunu başlatır.
cd "$(dirname "$0")/server"
KYB_TOKEN="${KYB_TOKEN:-degistir-bunu}" KYB_PORT="${KYB_PORT:-8080}" exec python3 server.py
