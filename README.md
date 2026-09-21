# Gladys Gateway

## Context

The Gladys Gateway is an end-to-end encrypted gateway between your local Gladys installation (your Raspberry Pi at home for example), and your browser on the internet.

When you are away from home, it becomes easier with the Gladys Gateway to control your home without having to open any ports on your internet box.

## How to use the Gladys Gateway?

To subscribe to Gladys Plus:

- [French users](https://gladysassistant.com/fr/plus/)
- [International users](https://gladysassistant.com/plus/)

This service is paid as I need to pay for the servers and infrastructure.

Thanks to everyone who supports this project 🙏

## Why this repository is open-source?

This repository is open-source so the community can audit the code.

There is no need to run this repo yourself, as if you want to access Gladys remotely without using Gladys Plus, you can just setup a VPN to your home network.

## Release process

Docker images are only published from a Git tag, so a release can be rolled back by deploying the previous `vX.Y.Z` image. Everything happens in the GitHub interface:

1. Open the [Prepare release](../../actions/workflows/prepare-release.yml) workflow, click **Run workflow** on `master` and pick the bump type (`patch`, `minor` or `major`). It bumps the version in `package.json` on a `release/vX.Y.Z` branch and links to the pull request to open.
2. Open and merge the release pull request once the checks are green.
3. On merge, the **Create release tag** workflow tags `vX.Y.Z` on `master` and starts the **Release Docker image** workflow, which builds and pushes `gladysassistant/gladys-gateway-server:vX.Y.Z` and `latest` to Docker Hub.

Merging a regular pull request to `master` no longer publishes an image.

## Admin API

The routes under `/admin/api/` are used to administrate Gladys Plus accounts (list and inspect accounts, reset the two factor authentication of a user, delete a user or an account, check the Enedis synchronization, publish Gladys versions). They are documented with apidoc (`npm run apidoc`, group "Admin API").

Two ways to authenticate:

- **API key** (scripts, CI, AI agents): header `X-Admin-Api-Key` holding the value of `ADMIN_API_AUTHORIZATION_TOKEN` (64 characters minimum). Wrong keys are rate limited per IP (5 failures per 24 hours).
- **Super admin session** (admin UI): a regular Gladys Plus access token (`Authorization: Bearer <jwt>`, `dashboard:write` scope) of the user whose id is `SUPER_ADMIN_USER_ID`.

`POST /admin/api/gladys/versions` also accepts the restricted key `GLADYS_VERSION_API_KEY` (optional, 64 characters minimum), which is the only key the Gladys release workflow needs. It cannot be used on any other route. Example step to publish a version from a GitHub Action:

```yaml
- name: Publish the version to Gladys Plus
  run: |
    status=$(curl -s -o response.json -w "%{http_code}" -X POST "https://<gateway-url>/admin/api/gladys/versions" \
      -H "Content-Type: application/json" \
      -H "X-Admin-Api-Key: ${{ secrets.GLADYS_VERSION_API_KEY }}" \
      -d '{
        "name": "${{ github.ref_name }}",
        "default_release_note_link": "https://github.com/GladysAssistant/Gladys/releases/tag/${{ github.ref_name }}",
        "fr_release_note_link": "https://gladysassistant.com/fr/blog/${{ github.ref_name }}"
      }')
    cat response.json
    # 201: created, 409: already published by a previous run of this workflow
    case "$status" in
      201|409) exit 0 ;;
      *) echo "Unexpected status $status" && exit 1 ;;
    esac
```

The call answers `201` with the created version, `409` if the version already exists (so a re-run of the workflow is harmless, as shown above) and `422` if the body is invalid. A published version can be rolled back with `PATCH /admin/api/gladys/versions/:id` and `{ "active": false }`.

### Account lifecycle

Three jobs keep the accounts table consistent with Stripe, chase the customers who never activated their account and clean up the accounts that left. All are read-only by default: they answer with the report of what they would do, and only act when called with `{ "execute": true }`.

- `POST /admin/api/accounts/sync-stripe` reconciles every account having a Stripe subscription with Stripe (status, plan, end of access). It repairs the accounts left behind by a missed webhook, typically an account stuck in `past_due` whose subscription Stripe has since canceled. Run it once after a deploy, or whenever the numbers of the admin UI and of Stripe disagree.
- `POST /admin/api/accounts/activation-reminders` reminds the customers who subscribed through Stripe Checkout but never activated their Gladys Plus account. `ACCOUNT_ACTIVATION_REMINDER_DELAY_IN_DAYS` (7 by default) after the account was created (the welcome email is sent at that moment), the billing email receives one reminder with a fresh activation link, in the language of the checkout. An account is a candidate only while its subscription is running (Stripe is asked, the status in database is not trusted), it has no user and no reminder was sent yet: each account is reminded once. Unlike the two other jobs, this one is scheduled by the server itself (see below): the route is there to review the candidates without `execute`, or to run the job by hand. On the first deployment, every old account never activated is a candidate at once: review the list first.
- `POST /admin/api/accounts/retention` applies the retention policy to the accounts whose subscription is over. `ACCOUNT_RETENTION_GRACE_PERIOD_IN_DAYS` (180 by default) after the end of access, the users of the account receive an email announcing the deletion; `ACCOUNT_RETENTION_WARNING_PERIOD_IN_DAYS` (30 by default) later, the account is deleted with its backups, users, instances and Enedis data. The status stored in database is not trusted: Stripe is asked, before warning and before deleting, whether the customer still has a running subscription, in which case the account is reported as an error and left alone. Meant to be called daily by a cron. Before the first execution, review the list it returns without `execute` and flag the accounts to keep as internal.

The activation reminders run inside the server, from `core/service/scheduler.js`: `ACCOUNT_ACTIVATION_REMINDER_CRON` is the cron expression (`0 9 * * *` by default, in the timezone of the server, `TZ`), set it to `disabled` to turn the job off. Every replica of the server schedules the job, a Redis lock makes sure only one runs it. An invalid expression refuses to start the server.

### Instance watchdog

"Is my Gladys alive?": the gateway is the only party able to tell a user that his home is unreachable (power cut, dead SD card, internet box down while on holidays), precisely because the home itself cannot. An admin of the account enables it (`PATCH /accounts/instance-offline-alert` with `enabled` and `delay_in_minutes`, 60 by default, between 5 minutes and 7 days; the current values are returned by `GET /users/me`). When the primary instance of the account has not been connected to the gateway for longer than that delay, the confirmed admins of the account receive the "instance offline" email, once per outage; when the instance connects again, the "back online" email.

`POST /admin/api/instances/watchdog` is the job that does it, with the same read-only-by-default contract as the jobs above (`{ "execute": true }` to send the emails). It compares the primary instances of the active accounts with the instances connected in websocket on the cluster, and refreshes `last_seen_at` of the connected ones (the websocket disconnect records it too, so the outage start is exact). Meant to be called every few minutes by a cron, for example:

```
*/5 * * * * curl -s -X POST "https://<gateway-url>/admin/api/instances/watchdog" -H "Content-Type: application/json" -H "X-Admin-Api-Key: $ADMIN_API_KEY" -d '{"execute": true}'
```

The frequency only decides how late after the delay the email leaves: an instance is never reported offline while it is connected, whatever the cron interval. The job fails closed: when none of the instances is connected while at least `INSTANCE_WATCHDOG_FAIL_CLOSED_MIN_INSTANCES` (10 by default) of them are checked, the socket cluster is suspect rather than every customer, and the run is aborted without any email (`"aborted": "no_instance_connected"` in the report).

### Recovery codes reminders

A user who enabled two factor authentication without generating recovery codes (or who used them all) loses the account with the authenticator app. `POST /admin/api/users/recovery-codes-reminders` reminds these users by email, in their language, with a link to the security settings of the dashboard where the codes are generated. The reminder is sent again every `RECOVERY_CODES_REMINDER_INTERVAL_IN_DAYS` (90 by default) until the codes exist; generating the codes resets the countdown, so a user who later uses every code is reminded at the next run. Only the confirmed users of an account whose subscription is running are candidates, the users of internal accounts never are. Like the other jobs, the route is read-only by default and only sends the emails with `{ "execute": true }`. The server runs it daily by itself (`RECOVERY_CODES_REMINDER_CRON`, `30 9 * * *` by default, `disabled` to turn it off), with the same Redis lock as the activation reminders: the route is there to review the candidates, or to run the job by hand. `POST /admin/api/users/:id/recovery-codes-reminder` sends the email to one user right away, whatever the interval or the codes (to test the email on a user of yours, or to chase a user by hand); the date is recorded like for the job. On the first deployment, every user who enabled two factor before the recovery codes existed is a candidate at once: review the list first.

Internal accounts (team, tests, demos) are flagged with `PATCH /admin/api/accounts/:id` and `{ "is_internal": true }`: they are excluded from the paying users stats and are never touched by the activation reminders, the recovery codes reminders nor the retention policy.
