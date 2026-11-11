# Observability

The replacement stack lives in
[`infrastructure/monitoring/observability`](../infrastructure/monitoring/observability/kustomization.yaml).
It replaces the old separate Grafana, kube-prometheus-stack, and loki-stack
manifests. All components share the `observability` namespace.

## Components

| Component | Purpose | Chart version |
| --- | --- | --- |
| Prometheus Operator stack | Metrics, Kubernetes dashboards, node exporter, kube-state-metrics, and Alertmanager | kube-prometheus-stack `93.1.0` |
| Grafana | Dashboards and exploration of metrics and logs; included in the Prometheus stack | Pinned by the stack chart |
| Loki | Kubernetes application logs, single-instance filesystem storage | loki `7.5.0` |
| Alloy | Collect pod logs through the Kubernetes API and send them to Loki | alloy `1.15.0` |

Prometheus collects pod/container resource metrics and Kubernetes object state.
Application-specific metrics require an application metrics endpoint and a
ServiceMonitor or PodMonitor. Pod logs are collected automatically, with cluster,
namespace, pod, container, and node labels. This is not distributed tracing.

## Storage and access

All persistent volumes use the verified Synology iSCSI class `syno-storage`:

| Component | Requested capacity | Retention |
| --- | --- | --- |
| Prometheus | 30 GiB | 14 days or 20 GB, whichever limit is reached first |
| Grafana | 5 GiB | Dashboard/configuration persistence |
| Alertmanager | 2 GiB | 5 days for notification state |
| Loki | 30 GiB | 7 days |

The storage class retains NAS volumes when claims are deleted. Loki has one
replica and filesystem storage: it is sized for this homelab, and is not highly
available. Loki retention limits age rather than disk usage; watch disk capacity.
NAS-backed metrics and logs are unavailable while the NAS is unavailable.

Grafana uses private ingress at `grafana.orriborri.com` with a certificate requested
from `letsencrypt-prod`. LAN DNS must resolve this name to the private ingress
address (`192.168.11.99`). DNS and certificate readiness must be checked after
deployment. Prometheus, Alertmanager, Loki, and Alloy use internal services.
Loki's tenant authentication is disabled for this internal deployment; do not
expose its endpoint to external networks without authentication.

The Grafana chart generates an admin password in a Kubernetes Secret; no static
password is stored in Git. To retrieve it locally after deployment:

```bash
kubectl --kubeconfig .talos-local/kubeconfig -n observability get secret \
  observability-metrics-grafana -o jsonpath='{.data.admin-password}' | base64 -d
```

Log in as `admin`. For access independent of ingress and DNS:

```bash
kubectl --kubeconfig .talos-local/kubeconfig -n observability \
  port-forward service/observability-metrics-grafana 3000:80
```

Open `http://localhost:3000`. Grafana provisions Prometheus and Loki data sources
and the chart's Kubernetes dashboards. In Explore, select Loki and try
`{cluster="homelab", namespace="default"}`.

## Alerts

The stack includes Kubernetes/Prometheus alert rules and Alertmanager. External
notification delivery is not configured; alerts can be inspected locally. A
notification destination and credentials must be configured before relying on
out-of-band notifications. Monitoring runs inside the monitored cluster, so it
cannot independently report a complete cluster outage.

Talos control-plane etcd, controller-manager, scheduler, and kube-proxy endpoint
scraping and related endpoint rules are disabled in this initial setup. API
server, kubelet, workload state, and node metrics provide the baseline. Enabling
those control-plane targets requires separate endpoint and certificate work.

## Home Assistant and Pi: metrics/log integration pending

Home Assistant is an existing Proxmox VM, separate from Kubernetes. The retained
`apps/homeassistant` workload is not this VM; do not deploy a second instance to
monitor the existing one.

Discovered addresses: Home Assistant is `192.168.10.96` with root SSH access;
the Pi is `192.168.10.67` (`rpi3b`), also accessible as root. The Pi runs
RTL433, Theengs Gateway, and an OpenThread Border Router in Podman. Its MQTT
broker has been [moved to Kubernetes](mqtt.md), and the clients and Home Assistant
were updated to use the cluster broker. External metrics and log collection
have not yet been configured.

Home Assistant also writes state history to the separate InfluxDB instance;
this does not configure Prometheus metrics or log forwarding. See the
[InfluxDB guide](influxdb.md). For Home Assistant metrics, enable its authenticated `prometheus:` integration and scrape
`/api/prometheus` with a long-lived access token stored in an encrypted Secret.
Select relevant entities to control metric volume. Changing its configuration
requires validation and a Home Assistant restart. Logs need an available log
source or forwarding route; Home Assistant OS access differs from a normal Linux
host and must be established before choosing a collector.

The Pi's RTL433 event messages are stored separately in InfluxDB and available
through the Grafana **RTL433 Devices** dashboard. This records radio events;
Pi host metrics and log forwarding are still unconfigured. See the
[RTL433 guide](rtl433.md).

For a Linux Pi, Alloy can collect journal/file logs and host metrics. Inventory
its actual services first, then add application metrics endpoints and uptime
checks where available. Provide an authenticated private route to Loki for the
Pi's log forwarding; Loki currently has no external ingestion route.

## Deployment and verification

Both the root cluster entrypoint and the infrastructure registration list refer
to `observability.yaml`, which depends on `sources` and `synology-csi`. The CSI
registration is also included in the root entrypoint. Flux can manage the new
paths after the changes are committed, pushed, and reconciled. Live application
of the HelmReleases does not publish these repository changes.

```bash
kubectl kustomize infrastructure/monitoring/observability
kubectl kustomize clusters/homelab
kubectl --kubeconfig .talos-local/kubeconfig -n observability get helmreleases
kubectl --kubeconfig .talos-local/kubeconfig -n observability get pods,pvc
kubectl --kubeconfig .talos-local/kubeconfig -n observability get ingress,certificate
```

Before considering the stack operational, verify HelmRelease readiness, bound
claims, ready pods, Prometheus targets returning `up == 1`, Loki receiving recent
pod logs, and Grafana data-source health. See deployment results recorded below.

## References

- [Prometheus stack chart](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack)
- [Loki chart](https://github.com/grafana/loki/tree/main/production/helm/loki)
- [Alloy log collection](https://grafana.com/docs/alloy/latest/collect/)
- [Home Assistant Prometheus integration](https://www.home-assistant.io/integrations/prometheus/)
