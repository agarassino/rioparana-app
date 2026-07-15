#!/usr/bin/env bash
#
# harden.sh — baseline hardening for a fresh Ubuntu 24.04 Hetzner VPS.
#
# Run as root on the server:
#     bash harden.sh [username]        # default username: deploy
#
# SAFETY — this disables SSH password auth. Before you disconnect:
#   1. Keep your CURRENT root SSH session open.
#   2. Open a SECOND terminal and confirm you can log in with your key
#      (ssh deploy@<IP>  and  ssh root@<IP>) BEFORE closing the first one.
# If key login fails, you still have the open session to fix it.
#
# This script is idempotent — safe to re-run.

set -euo pipefail

NEW_USER="${1:-deploy}"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: run this as root." >&2
  exit 1
fi

echo "==> 1/5 Creating sudo user '$NEW_USER' and copying the SSH key"
if ! id "$NEW_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$NEW_USER"
fi
usermod -aG sudo "$NEW_USER"
install -d -m 700 -o "$NEW_USER" -g "$NEW_USER" "/home/$NEW_USER/.ssh"
if [ -s /root/.ssh/authorized_keys ]; then
  install -m 600 -o "$NEW_USER" -g "$NEW_USER" \
    /root/.ssh/authorized_keys "/home/$NEW_USER/.ssh/authorized_keys"
else
  echo "WARNING: /root/.ssh/authorized_keys is empty — make sure you added an SSH key at server creation." >&2
fi
# Passwordless sudo (the user has no password, so sudo can't prompt for one).
echo "$NEW_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$NEW_USER"
chmod 440 "/etc/sudoers.d/90-$NEW_USER"

echo "==> 2/5 Hardening SSH (key-only, no passwords, no root password login)"
cat > /etc/ssh/sshd_config.d/99-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitRootLogin prohibit-password
X11Forwarding no
EOF
# Validate config before reloading so a typo can't lock you out.
sshd -t
systemctl reload ssh 2>/dev/null || systemctl reload sshd

echo "==> 3/5 Installing firewall, fail2ban, unattended-upgrades"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ufw fail2ban unattended-upgrades

echo "==> 4/5 Configuring the firewall (default-deny inbound)"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH                 # public SSH — CLOSE THIS after Tailscale (see HARDENING.md)
ufw allow 80/tcp                  # HTTP (Let's Encrypt + redirect)
ufw allow 443/tcp                # HTTPS
ufw allow in on tailscale0       # all traffic over the Tailscale mesh (SSH, Coolify UI :8000, etc.)
ufw --force enable

echo "==> 5/5 Enabling automatic security updates + fail2ban"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
cat > /etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
EOF
systemctl enable --now fail2ban

echo
echo "==> DONE. Baseline hardening applied."
echo "   NEXT (do NOT close your current session until you verify):"
echo "   1. New terminal: ssh $NEW_USER@<IP>   and   ssh root@<IP>  (key must work)"
echo "   2. Install Tailscale, then follow HARDENING.md to close public SSH (22)"
echo "      and restrict 80/443 to Cloudflare. The Coolify UI (:8000) stays"
echo "      private — reach it over Tailscale only."
