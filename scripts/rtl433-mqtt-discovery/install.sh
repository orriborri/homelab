#!/usr/bin/bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this installer as root." >&2
  exit 1
fi

cd -- "$(dirname -- "$0")"

source_url=https://raw.githubusercontent.com/merbanan/rtl_433/3962dd97f9181f0dcd0e5bedd96ffd74060c19c3/examples/rtl_433_mqtt_hass.py
install_dir=/usr/local/libexec/rtl433-mqtt-discovery

command -v python3 >/dev/null
command -v curl >/dev/null
install -d -m 0755 "$install_dir"
python3 -m venv "$install_dir/venv"
"$install_dir/venv/bin/pip" install --disable-pip-version-check paho-mqtt==2.1.0
curl --fail --silent --show-error "$source_url" \
  -o "$install_dir/rtl_433_mqtt_hass.py"
install -m 0755 run-bridge.sh "$install_dir/run-bridge.sh"
install -m 0644 rtl433-mqtt-discovery.service \
  /etc/systemd/system/rtl433-mqtt-discovery.service

systemctl daemon-reload
systemctl enable --now rtl433-mqtt-discovery.service
