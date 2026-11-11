# InfluxDB for Home Assistant

InfluxDB 2 runs in the `influxdb` namespace as a single replica, with a 10 GiB
Synology iSCSI volume (`syno-storage`). The Flux endpoint is available on the
LAN at `http://192.168.11.5:8086` and inside Kubernetes at
`http://influxdb.influxdb.svc.cluster.local:8086`. There is no ingress or public
DNS record.

The `homeassistant` organization and bucket are provisioned with 90-day
retention. Home Assistant writes new state changes using a bucket-scoped
write-only token. Grafana has a separate bucket-scoped read-only token and a
provisioned datasource named **Home Assistant InfluxDB** (UID
`homeassistant-influxdb`). The admin credentials and both client tokens are
stored as SOPS-encrypted Kubernetes Secrets. The client tokens are not stored in
Git as plaintext. The InfluxDB admin token can access more data than either
client token and must only be used for administration.

The database is an additional history sink; it does not replace Home
Assistant's Recorder database or backfill its old history. Retention begins
when data is written to this bucket. Its single pod and NAS volume are not a
high availability arrangement.

## Home Assistant configuration

The YAML connection was imported by Home Assistant into its InfluxDB
integration entry. The running configuration now keeps only integration
options in YAML; the imported connection and token are managed by Home
Assistant. The options currently in `/config/configuration.yaml` are:

```yaml
influxdb:
  max_retries: 3
  default_measurement: state
  tags:
    source: homeassistant
```

For a new Home Assistant instance, use the connection example in
[`homeassistant/influxdb.yaml`](homeassistant/influxdb.yaml) and put the token
in `/config/secrets.yaml`, then validate the configuration. Home Assistant
imports the connection into its integration storage. After confirming the
integration entry exists, remove `api_version`, `host`, `port`, `ssl`,
`organization`, `bucket`, and `token` from YAML, keeping only the options shown
above. Do not check the real token into Git.

The live HA instance is `192.168.10.96`. Its pre-change configuration was backed
up on the HAOS host under `/backup/influxdb-setup-20261111-122110/`.

## Grafana

Open Grafana's Explore view and select **Home Assistant InfluxDB**. Flux queries
can use the `homeassistant` bucket, for example:

```flux
from(bucket: "homeassistant")
  |> range(start: -1h)
  |> filter(fn: (r) => r.source == "homeassistant")
```

The Grafana datasource health API can be checked through a port-forward:

```bash
kubectl --kubeconfig .talos-local/kubeconfig -n observability \
  port-forward service/observability-metrics-grafana 3000:80
```

Then query `/api/datasources/uid/homeassistant-influxdb/health` on localhost
with Grafana authentication. Do not put the datasource token into dashboards,
queries, or documentation.

## Deployment and checks

The Flux resource is registered from the root cluster entrypoint and depends
on the Helm source and Synology CSI. Encrypted credentials are decrypted using
the `sops-gpg` key. To render and inspect manifests:

```bash
kubectl kustomize infrastructure/monitoring/influxdb
kubectl kustomize infrastructure/monitoring/observability
kubectl kustomize clusters/homelab
```

Live setup verification on 2026-11-11 found the HelmRelease ready, the
`influxdb-0` pod running, and the 10 GiB PVC bound. The Home Assistant bucket
contained 239 entity series. A query with the Home Assistant write token was
denied, and Grafana reported its datasource healthy with one bucket visible.

Useful status checks:

```bash
kubectl --kubeconfig .talos-local/kubeconfig -n influxdb \
  get helmrelease,pod,pvc,service
kubectl --kubeconfig .talos-local/kubeconfig -n influxdb \
  logs statefulset/influxdb
```

## References

- [Home Assistant InfluxDB integration](https://www.home-assistant.io/integrations/influxdb/)
- [InfluxDB 2 token permissions](https://docs.influxdata.com/influxdb/v2/admin/tokens/create-token/)
- [InfluxData Helm chart](https://github.com/influxdata/helm-charts/tree/master/charts/influxdb2)
