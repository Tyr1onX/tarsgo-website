#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
tencent_alias="${TENCENT_BOOTSTRAP_ALIAS:-tencent}"
production_alias="${PRODUCTION_SSH_ALIAS:-racknerd}"
ssh_bin="${SSH_BIN:-ssh}"
scp_bin="${SCP_BIN:-scp}"
known_hosts_file="${SSH_KNOWN_HOSTS:-$HOME/.ssh/known_hosts}"
min_free_bytes=4294967296
remote_helper="/tmp/jijia-backup-accept.$$.sh"
remote_key_file="/tmp/jijia-backup-authorized.$$.pub"
tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "$tmp_dir"' EXIT

if [[ ! -f "$repo_root/scripts/accept-production-backup.sh" ]]; then
  echo "Backup setup aborted: remote backup acceptance helper is missing." >&2
  exit 1
fi

production_free_bytes="$("$ssh_bin" -o BatchMode=yes "$production_alias" "df -B1 --output=avail / | tail -n 1 | tr -d '[:space:]'")"
if [[ ! "$production_free_bytes" =~ ^[0-9]+$ || "$production_free_bytes" -lt "$min_free_bytes" ]]; then
  production_free_gib="$(awk -v bytes="${production_free_bytes:-0}" 'BEGIN { printf "%.1f", bytes / 1073741824 }')"
  echo "Production backup setup aborted: only ${production_free_gib} GiB available; at least 4 GiB is required." >&2
  exit 1
fi

"$ssh_bin" -o BatchMode=yes "$tencent_alias" true
host_name="$("$ssh_bin" -G "$tencent_alias" | awk '$1 == "hostname" { print $2; exit }')"
host_port="$("$ssh_bin" -G "$tencent_alias" | awk '$1 == "port" { print $2; exit }')"
if [[ ! "$host_name" =~ ^[A-Za-z0-9.-]+$ || ! "$host_port" =~ ^[0-9]+$ || ! -f "$known_hosts_file" ]]; then
  echo "Backup setup aborted: unable to resolve Tencent host or local known-hosts file." >&2
  exit 1
fi
known_host_name="$host_name"
if [[ "$host_port" != 22 ]]; then
  known_host_name="[$host_name]:$host_port"
fi
known_host_lines="$(ssh-keygen -F "$known_host_name" -f "$known_hosts_file" | sed '/^#/d')"
if [[ -z "$known_host_lines" ]]; then
  echo "Backup setup aborted: Tencent host key is not pinned in $known_hosts_file." >&2
  exit 1
fi

"$scp_bin" -o BatchMode=yes "$repo_root/scripts/accept-production-backup.sh" "$tencent_alias:$remote_helper"
"$ssh_bin" -o BatchMode=yes "$tencent_alias" sudo -n bash -s -- "$remote_helper" <<'REMOTE_SETUP'
set -Eeuo pipefail
helper_source="$1"
if ! getent group jijia-backup >/dev/null; then
  groupadd --system jijia-backup
fi
if ! id jijia-backup >/dev/null 2>&1; then
  useradd --system --gid jijia-backup --home-dir /var/lib/jijia-backup --create-home --shell /bin/sh jijia-backup
fi
install -d -o jijia-backup -g jijia-backup -m 0700 /var/lib/jijia-backup /var/lib/jijia-backup/incoming
install -d -o root -g root -m 0700 /opt/backups/jijia
install -o root -g root -m 0755 "$helper_source" /usr/local/sbin/jijia-backup-accept
rm -f -- "$helper_source"
printf '%s\n' 'jijia-backup ALL=(root) NOPASSWD: /usr/local/sbin/jijia-backup-accept *' >/etc/sudoers.d/jijia-backup
chmod 0440 /etc/sudoers.d/jijia-backup
visudo -cf /etc/sudoers.d/jijia-backup
REMOTE_SETUP

public_key="$("$ssh_bin" -o BatchMode=yes "$production_alias" bash -s <<'REMOTE_KEY'
set -Eeuo pipefail
install -d -o root -g root -m 0700 /root/.ssh
key=/root/.ssh/jijia-backup-ed25519
if [[ ! -s "$key" ]]; then
  ssh-keygen -q -t ed25519 -N '' -C jijia-production-backup -f "$key"
elif [[ ! -s "$key.pub" ]]; then
  ssh-keygen -y -f "$key" >"$key.pub"
fi
chmod 0600 "$key"
chmod 0644 "$key.pub"
cat "$key.pub"
REMOTE_KEY
)"
if [[ ! "$public_key" =~ ^ssh-ed25519[[:space:]][A-Za-z0-9+/=]+[[:space:]][A-Za-z0-9._-]+$ ]]; then
  echo "Backup setup aborted: production backup public key was not valid." >&2
  exit 1
fi
printf 'restrict %s\n' "$public_key" >"$tmp_dir/authorized_keys"
chmod 0600 "$tmp_dir/authorized_keys"
"$scp_bin" -o BatchMode=yes "$tmp_dir/authorized_keys" "$tencent_alias:$remote_key_file"
"$ssh_bin" -o BatchMode=yes "$tencent_alias" sudo -n bash -s -- "$remote_key_file" <<'REMOTE_KEY_INSTALL'
set -Eeuo pipefail
temp_key_file="$1"
backup_home="$(getent passwd jijia-backup | cut -d: -f6)"
install -d -o jijia-backup -g jijia-backup -m 0700 "$backup_home" "$backup_home/.ssh"
authorized_keys="$backup_home/.ssh/authorized_keys"
touch "$authorized_keys"
if ! grep -Fxq -f "$temp_key_file" "$authorized_keys"; then
  cat "$temp_key_file" >>"$authorized_keys"
fi
chown jijia-backup:jijia-backup "$authorized_keys"
chmod 0600 "$authorized_keys"
rm -f -- "$temp_key_file"
REMOTE_KEY_INSTALL

cat >"$tmp_dir/ssh-config" <<EOF
Host tencent-backup
  HostName $host_name
  Port $host_port
  User jijia-backup
  IdentityFile /root/.ssh/jijia-backup-ed25519
  IdentitiesOnly yes
  UserKnownHostsFile /root/.ssh/jijia-backup-known_hosts
  StrictHostKeyChecking yes
  BatchMode yes
EOF
printf '%s\n' "$known_host_lines" >"$tmp_dir/known_hosts"
chmod 0600 "$tmp_dir/ssh-config" "$tmp_dir/known_hosts"
"$scp_bin" -o BatchMode=yes "$tmp_dir/ssh-config" "$tmp_dir/known_hosts" "$production_alias:/tmp/"
"$ssh_bin" -o BatchMode=yes "$production_alias" bash -s <<'REMOTE_CONFIG'
set -Eeuo pipefail
install -d -o root -g root -m 0700 /root/.ssh
install -o root -g root -m 0600 /tmp/ssh-config /root/.ssh/jijia-backup-ssh-config
install -o root -g root -m 0600 /tmp/known_hosts /root/.ssh/jijia-backup-known_hosts
rm -f /tmp/ssh-config /tmp/known_hosts
ssh -F /root/.ssh/jijia-backup-ssh-config tencent-backup true
REMOTE_CONFIG

echo "Production backup destination configured: Tencent /opt/backups/jijia (dedicated restricted key; host key pinned from the local tencent alias)."
