# TreeMonk geocoder proxy

A tiny, zero-dependency Node server that shields the public Nominatim server
from TreeMonk's user base — as [Nominatim's usage policy](https://operations.osmfoundation.org/policies/nominatim/)
expects from a distributed application.

**What it does**

- One **shared, disk-backed cache** for every TreeMonk user: a place string is
  geocoded once, ever — repeat lookups never leave the VPS.
- One **global ≥1.1 s/request throttle** towards the public Nominatim server
  (instead of every installed app hitting it separately).
- Optional **commercial upstream** (LocationIQ, Nominatim-compatible): set
  `LOCATIONIQ_KEY` and the public OSM server is not used at all — the API key
  never leaves the server.

**How the app uses it**

The app tries `https://treemonk.eu/geocode/search?...` first. If that fails
(not deployed yet, down), it transparently falls back to the public Nominatim
endpoint with its own client-side 1.1 s throttle — so deploying this proxy
requires **no app update and no coordination**: the moment it's up, every
installed app starts using it.

Self-hosters can point their app elsewhere with the `TREEMONK_GEOCODER`
environment variable (e.g. `TREEMONK_GEOCODER=http://127.0.0.1:8790`).

## Deploy (any VPS with Node 20+)

```bash
mkdir -p /opt/treemonk-geocoder && cd /opt/treemonk-geocoder
# copy server.mjs here
node server.mjs   # listens on 127.0.0.1:8790
```

### systemd

`/etc/systemd/system/treemonk-geocoder.service`:

```ini
[Unit]
Description=TreeMonk geocoder proxy
After=network.target

[Service]
WorkingDirectory=/opt/treemonk-geocoder
ExecStart=/usr/bin/node /opt/treemonk-geocoder/server.mjs
Restart=always
Environment=PORT=8790
Environment=CACHE_DIR=/opt/treemonk-geocoder/cache
# Optional — switch to LocationIQ (free tier: 5000 req/day) instead of the
# public Nominatim. Get a key at https://locationiq.com
#Environment=LOCATIONIQ_KEY=pk.xxxxxxxx
#Environment=CONTACT=mailto:you@example.com

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now treemonk-geocoder
curl -s 'http://127.0.0.1:8790/status'          # → {"ok":true}
curl -s 'http://127.0.0.1:8790/search?q=Kecskem%C3%A9t' | head -c 200
```

### nginx (in the treemonk.eu vhost)

```nginx
location /geocode/ {
    proxy_pass http://127.0.0.1:8790/;
    proxy_set_header Accept-Language $http_accept_language;
}
```

Then verify from outside:

```bash
curl -s 'https://treemonk.eu/geocode/status'    # → {"ok":true}
```

## Notes

- The cache never expires by itself (place coordinates don't move); wipe the
  `cache/` directory if you ever need a clean slate.
- Responses are raw upstream JSON (Nominatim `jsonv2` shape; LocationIQ's
  `format=json` is field-compatible for everything the app reads:
  `display_name`, `lat`, `lon`, `address`).
- The server binds `127.0.0.1` only — nginx is the public face and provides
  TLS.
