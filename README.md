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

Two jobs keep the accounts table consistent with Stripe and clean up the accounts that left. Both are read-only by default: they answer with the report of what they would do, and only act when called with `{ "execute": true }`.

- `POST /admin/api/accounts/sync-stripe` reconciles every account having a Stripe subscription with Stripe (status, plan, end of access). It repairs the accounts left behind by a missed webhook, typically an account stuck in `past_due` whose subscription Stripe has since canceled. Run it once after a deploy, or whenever the numbers of the admin UI and of Stripe disagree.
- `POST /admin/api/accounts/retention` applies the retention policy to the accounts whose subscription is over. `ACCOUNT_RETENTION_GRACE_PERIOD_IN_DAYS` (180 by default) after the end of access, the users of the account receive an email announcing the deletion; `ACCOUNT_RETENTION_WARNING_PERIOD_IN_DAYS` (30 by default) later, the account is deleted with its backups, users, instances and Enedis data. Meant to be called daily by a cron. Before the first execution, review the list it returns without `execute` and flag the accounts to keep as internal.

Internal accounts (team, tests, demos) are flagged with `PATCH /admin/api/accounts/:id` and `{ "is_internal": true }`: they are excluded from the paying users stats and are never touched by the retention policy.
