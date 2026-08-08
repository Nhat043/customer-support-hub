# Local Observability

`docker compose up --build` starts the API plus Prometheus, Loki, Promtail, and Grafana.

- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001` with `admin` / `admin` for local use only
- Loki: `http://localhost:3100`

Prometheus scrapes `api:4000/api/metrics`. Grafana provisions the Prometheus and Loki datasources, then loads the Workflow Platform overview dashboard automatically.

Promtail reads Docker JSON logs through the Docker socket and the Docker container log directory. This is intended for local development only. Production should use the cloud logging agent or a restricted collector identity instead of mounting the Docker socket.
