# Bluetooth device history

The Pi's Theengs Gateway scans BLE advertisements and publishes decoded JSON
readings on `home/TheengsGateway/BTtoMQTT`. A Telegraf service in Kubernetes
subscribes to that topic and writes the readings to the separate InfluxDB 2
`bluetooth` bucket, which retains data for 90 days. MQTT discovery messages for
Home Assistant are not stored in this bucket.

The MQTT client credential and bucket-scoped InfluxDB writer token are in a
SOPS-encrypted Secret. Grafana has its own bucket-scoped read-only token and
datasource named **Bluetooth**. The **Bluetooth Devices** dashboard shows unique
IDs seen over the last 24 hours, signal strength, and recent decoded readings.

## What “active” means

The dashboard shows devices heard during the selected time window. The Pi scans
periodically, and BLE sensors may advertise intermittently. A device missing
from the list is not necessarily powered off. Some BLE devices use rotating
private addresses, so one physical device may appear under multiple IDs unless
Theengs is configured with its identity information.

## View and verify

Open Grafana at `https://grafana.orriborri.com`, then choose **Dashboards →
Bluetooth Devices**. For direct exploration, select the **Bluetooth** datasource
and use Flux:

```flux
from(bucket: "bluetooth")
  |> range(start: -24h)
  |> filter(fn: (r) => r["_measurement"] == "bluetooth")
  |> keep(columns: ["_time", "name", "id", "brand", "model", "_field", "_value"])
  |> group()
  |> sort(columns: ["_time"], desc: true)
  |> limit(n: 100)
```

```bash
kubectl --kubeconfig .talos-local/kubeconfig -n bluetooth \
  get deployment,pod,configmap
kubectl --kubeconfig .talos-local/kubeconfig -n bluetooth \
  logs deployment/telegraf-bluetooth --tail=50
```

Telegraf reads Theengs' JSON advertisement fields, including device ID, model,
RSSI, and any decoded sensor readings. Theengs documents the topic and JSON
payload format in its [MQTT gateway guide](https://gateway.theengs.io/use/use.html).
