#!/usr/bin/bash
set -euo pipefail

config=/etc/rtl_433/rtl_433.conf
bridge=/usr/local/libexec/rtl433-mqtt-discovery/rtl_433_mqtt_hass.py
python=/usr/local/libexec/rtl433-mqtt-discovery/venv/bin/python

# Reuse the broker credentials already held in the root-only RTL433 config.
# Keep them out of the process argument list and service journal.
line=$(grep -m1 '^output mqtt://' "$config")
user=${line#*,user=}
user=${user%%,*}
password=${line#*,pass=}
password=${password%%,*}

if [[ -z "$user" || "$user" == "$line" || -z "$password" || "$password" == "$line" ]]; then
  echo "Could not read MQTT credentials from $config" >&2
  exit 1
fi

export MQTT_USERNAME="$user"
export MQTT_PASSWORD="$password"

exec "$python" "$bridge" \
  --host 192.168.11.4 \
  --port 1883 \
  --rtl-topic rtl_433/rpi3b/events \
  --retain
