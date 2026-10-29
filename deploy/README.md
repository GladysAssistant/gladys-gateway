# Blue/green deployment

The gateway runs on one VM behind the DigitalOcean load balancer, which terminates TLS and forwards the traffic to the VM on port 80. On the VM, `docker-compose.yml` runs:

- `proxy`: nginx, the only thing the load balancer talks to. It forwards the traffic to the active slot, chosen in `nginx/upstream.conf`.
- `gateway-blue` and `gateway-green`: two slots for the gateway image. One serves the traffic, the other is stopped (or is the version being deployed).

The Enedis worker (`node worker.js`) runs on another VM and is not part of this setup. It is updated on its own, after the gateway: on `docker stop` it finishes the running job before leaving (SIGTERM is handled by `worker.js`).

```
load balancer (TLS) ──> VM:80 nginx ──> gateway-blue:3000   (active)
                                    └─> gateway-green:3000  (next version)
```

A deployment starts the new version on the inactive slot, waits for it to answer `/ping` (which only happens after the database migrations and the Redis and Postgres connections), switches nginx to it, bakes for a few minutes and stops the previous slot. The switch is an nginx reload: the connections already open (websockets) stay on the previous slot until they close, the new ones go to the new slot. Nothing is cut.

## First setup

On the VM, in a copy of this directory (`scp -r deploy/ vm:gladys-gateway/`; the directory does not need to be a git checkout, `.env` and `nginx/upstream.conf` are state maintained by the script):

1. `cp .env.example .env` and set the two tags to the version currently running.
2. Create `gateway.env` with the environment of the gateway (database, Redis, secrets...). `SERVER_PORT` and `TRUSTED_PROXY_HOPS` are set by the compose file.
3. `docker compose up -d proxy gateway-blue`
4. Point the forwarding rule of the load balancer to port 80 of the VM, with the health check on `GET /ping`. The health check goes through nginx to the active slot: it fails when the slot is down, and answers 503 while the slot drains.
5. Set the idle timeout of the load balancer in line with the `proxy_read_timeout` of `nginx/gateway.conf` (10 minutes): some dashboard calls relayed to an instance last up to 5 minutes.

## Deploying a release

```bash
./deploy.sh v1.6.0
```

What happens, step by step:

1. The inactive slot gets the new tag in `.env`, its image is pulled and the slot is started. The database migrations run at this point, while the active slot still serves the traffic.
2. The script waits for the slot to answer `/ping` (5 minutes at most, `READY_TIMEOUT_IN_SECONDS`). If it never does, the slot is stopped and nothing has changed for the users.
3. `nginx/upstream.conf` is rewritten and nginx is reloaded. `/ping` is checked through the proxy: on failure, nginx is switched back to the previous slot.
4. Bake: for 5 minutes (`BAKE_IN_SECONDS`), both slots run and `/ping` is checked through the proxy every 10 seconds. On failure, nginx is switched back to the previous slot and the new one is left running for inspection. Ctrl-C leaves both slots running (the script says how to roll back or to finish).
5. The previous slot is stopped. Docker sends SIGTERM, the gateway drains: `/ping` answers 503, the scheduled jobs stop, the server stops accepting connections, the websockets are closed by batches spread over 30 seconds (the instances and dashboards reconnect to the new slot through nginx), the in-flight requests finish. `stop_grace_period` (60 seconds) covers it.

Keep the bake short: while both slots run, a user connected to one slot whose instance is still connected to the other goes through the Redis adapter, where the relay is capped at 15 seconds (see "Websocket relay" in the main README), so long dashboard calls may time out during that window.

Other commands:

```bash
./deploy.sh v1.6.0 --keep-old   # deploy and switch, but leave the previous slot running
./deploy.sh --switch blue       # send the traffic to a slot: instant rollback while it still runs
./deploy.sh --stop-old          # stop the inactive slot
./deploy.sh --status            # slots, tags, active one, containers
```

## Rollback

- During the bake, or after `--keep-old`: `./deploy.sh --switch <previous color>`, instant.
- Later: `./deploy.sh <previous tag>`, which is a normal deployment of the previous image (the images are published per release tag, see "Release process" in the main README). Database migrations are never rolled back, which is why they have to stay compatible with the previous version (next section).

## Rules for the code

- **Migrations are additive.** The new version migrates the database while the previous version still runs on it, and a rollback does not undo the migration. A migration only adds things (a nullable column or one with a default, a table, an index, created `CONCURRENTLY` when the table is big). Dropping or renaming a column, or making it `NOT NULL`, waits for a later release, once no deployed version uses it any more.
- **Every version must run next to the previous one** on the same Redis and Postgres: the socket.io Redis adapter relays between the slots, and the scheduled jobs take a Redis lock so that one slot only runs them.
- **The shutdown must stay graceful**: `core/service/gracefulShutdown.js` for the gateway, `worker.js` for the Enedis worker on its VM. The `SHUTDOWN_*` variables (drain delay, disconnect window, requests timeout, hard timeout) have to fit in the `stop_grace_period` of the compose file.
- **Two trusted proxy hops.** nginx appends its hop to `X-Forwarded-For`, so the gateway runs with `TRUSTED_PROXY_HOPS=2` (set in the compose file). Without nginx in front, the default of 1 (the load balancer alone) applies.

## Two VMs

To also survive a reboot or a failure of the VM, run this same setup on two droplets registered in the load balancer, with the health check on `/ping`. Stopping a slot makes `/ping` answer 503 during the drain delay (`SHUTDOWN_DRAIN_DELAY_IN_MS`, 5 seconds), so the load balancer stops sending traffic to that VM before the connections are closed: set the drain delay above the health check interval times the unhealthy threshold of the load balancer.
