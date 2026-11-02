#!/usr/bin/env bash
# Ubuntu UFW: зөвхөн SSH, HTTP, HTTPS нээнэ. Root-оор, VPS дээр гараар ажиллуулна.
set -euo pipefail
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status verbose
