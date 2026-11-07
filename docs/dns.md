# DNS setup

In addition to an A record pointing directly at my home IP, I've also configured a wildcard CNAME record pointing at my domain:

```
;; A Records
example.org.	    60	IN	A	  <my home IP>

;; CNAME Records
*.example.org.	    60	IN	CNAME	  example.org.
```

The idea is that:

- DNS requests to any subdomain will resolve to my home IP
- A port forward rule for ports 80 (HTTP) and 443 (HTTPS) in my router will forward any HTTP(S) traffic to `ingress-nginx` 
- `ingress-nginx` forwards requests to the corresponding HTTP service based on the `Host` HTTP header

Remember to forward ports 80 and 443 in your router once you know the IP address of your `ingress-nginx-public` service!

The records and router forwarding above describe an intended external setup; they are not verified live state. The repository also deploys [external-dns with Cloudflare](../infrastructure/networking/external-dns/deployment.yaml) for Services and Ingresses. Coordinate manually managed records with it. The [public ingress controller](../infrastructure/networking/ingress-nginx-public/release.yaml) requests a LoadBalancer address and defines ingress class `public`; the [private controller](../infrastructure/networking/ingress-nginx-private/release.yaml) defines class `private`. Select the appropriate class in each Ingress and confirm the assigned Service address before configuring the router.
