# hue-mqtt

Bridges the Hue bridge to MQTT (`home/lights/hue/{id}`, `home/sensors/hue/{id}`, `.../set`).
Telegraf's `home/#` subscription picks these up. Not enabled in `clusters/homelab/apps/kustomization.yaml` yet.

## Before enabling

1. Image: build the fork with MQTT credentials support and set the digest in `deployment.yaml`.
2. MQTT user: add a `hue-mqtt` entry to the Mosquitto `passwd` secret (`mosquitto_passwd`, then re-encrypt with `sops`).
3. Settings secret `hue-mqtt-settings` (key `Settings.toml`), edited with `sops`, never committed in plaintext:

```toml
[mqtt]
id = "hue-mqtt"
host = "mqtt.default.svc.cluster.local"
port = 1883
username = "hue-mqtt"
password = "<mosquitto password>"
sensor_topic = "home/sensors/hue/{id}"
light_topic = "home/lights/hue/{id}"
light_topic_set = "home/lights/hue/{id}/set"

[hue_bridge]
addr = "<hue bridge ip>"
appkey = "<hue app key>"
disable_host_name_verification = true
eventsource_timeout_seconds = 300
```

Wrap it as `kind: Secret`, `stringData: {Settings.toml: |...}`, name `hue-mqtt-settings`, save as
`settings-secret.yaml`, encrypt per `docs/sops.md`, then list it in `kustomization.yaml`.
