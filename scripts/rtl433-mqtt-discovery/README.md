# RTL433 MQTT discovery bridge

This installs the upstream `rtl_433_mqtt_hass.py` bridge as a systemd service on
the radio Pi. The bridge subscribes to `rtl_433/rpi3b/events`, publishes retained
Home Assistant MQTT discovery configs, and points each entity at RTL433's
existing per-device MQTT topics. RTL433 continues to publish to the same broker
and Grafana pipeline.

The upstream script is pinned to commit
`3962dd97f9181f0dcd0e5bedd96ffd74060c19c3` from
[`merbanan/rtl_433`](https://github.com/merbanan/rtl_433/blob/3962dd97f9181f0dcd0e5bedd96ffd74060c19c3/examples/rtl_433_mqtt_hass.py).
The installer requires Python 3, its `venv` module, and `curl`. It creates an
isolated virtual environment with Paho MQTT 2.1.0.

The service reads MQTT credentials from the existing root-only
`/etc/rtl_433/rtl_433.conf`; it does not copy credentials into another file.
The bridge uses retained discovery configs so Home Assistant can restore the
entities after a restart. Newly discovered sensors appear as they next transmit.

Install on the Pi by copying this directory there and running `sudo bash install.sh`.
The corresponding service is `rtl433-mqtt-discovery.service`.
