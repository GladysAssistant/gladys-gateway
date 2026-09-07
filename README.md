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

## Starter kit orders

The [starter kit](https://gladysassistant.com/fr/starter-kit/) (a mini-PC with Gladys pre-installed, a training and 6 months of Gladys Plus) is sold through Stripe Checkout. Orders are followed in this repository so that the manual work is reduced to: buying the mini-PC, installing Gladys on it, printing the label and dropping the parcel.

### Life cycle

```
paid → mini_pc_ordered → mini_pc_received → installed → shipped → delivered
                                                          ↘ cancelled
```

1. **Stripe webhook** (`checkout.session.completed`): when the session contains the starter kit product (`STRIPE_STARTER_KIT_PRODUCT_ID`, or `metadata.starter_kit=true` on the session), an order is created in `t_starter_kit_order` next to the Gladys Plus account, with a generated SSH password and a tracking token. The customer receives the confirmation email (training link and code, tracking page, pickup point choice) and a Telegram alert is sent.
2. **Customer tracking page** (`STARTER_KIT_TRACKING_URL`, on the website): calls `GET /starter-kit/orders/:token` to display the status, and posts the pickup point selected in the Mondial Relay widget to `POST /starter-kit/orders/:token/pickup-point`.
3. **Admin API** (`/admin/api/starter-kit/orders`, same authentication as the other Admin API routes: `X-Admin-Api-Key` header or super admin session): `POST /admin/api/starter-kit/orders/:id/status` moves the order forward and emails the customer at each step. Marking an order `shipped` creates the Mondial Relay shipment (tracking number and label PDF) when the customer has selected a pickup point, or accepts a `shipment_number` typed by hand. `POST /admin/api/starter-kit/orders/:id/label` creates the label ahead of time, without emailing the customer.
4. **Daily cron** (`POST /admin/api/starter-kit/daily`, `X-Admin-Api-Key` header): reminds customers who have not selected a pickup point after `STARTER_KIT_PICKUP_POINT_REMINDER_DAYS` days (3 by default), polls Mondial Relay tracking to mark shipped orders as `delivered` (and email the customer), and posts a digest of the orders in progress on Telegram.

Skipping steps is allowed (a mini-PC already in stock can go from `paid` to `installed`). `notify: false` in the status change body silences the customer email, `note` appends an internal note.

### Environment variables

| Variable                                                                                                                                                                                                                                                   | Description                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `STRIPE_STARTER_KIT_PRODUCT_ID`                                                                                                                                                                                                                            | Stripe product id of the starter kit (`prod_...`), used to detect the orders in the webhook                                               |
| `STARTER_KIT_TRACKING_SECRET`                                                                                                                                                                                                                              | Secret used to derive the customer tracking tokens (HMAC of the order id). Required: rotating it changes every tracking link already sent |
| `STARTER_KIT_TRACKING_URL`                                                                                                                                                                                                                                 | Public tracking page. `{language}` and `{token}` placeholders are replaced, otherwise `?token=` is appended                               |
| `STARTER_KIT_TRAINING_URL` / `STARTER_KIT_TRAINING_CODE`                                                                                                                                                                                                   | Link and code sent to the customer to access the training                                                                                 |
| `STARTER_KIT_INSTALL_GUIDE_URL`                                                                                                                                                                                                                            | Link to the installation guide, sent when the parcel is shipped                                                                           |
| `STARTER_KIT_SSH_USERNAME`                                                                                                                                                                                                                                 | SSH user of the mini-PC (default `gladys`), the password is generated per order                                                           |
| `STARTER_KIT_MINI_PC_SHOP_URL`                                                                                                                                                                                                                             | Optional link to the mini-PC product page, added to the Telegram alert                                                                    |
| `STARTER_KIT_PICKUP_POINT_REMINDER_DAYS`                                                                                                                                                                                                                   | Days before the pickup point reminder email (default 3)                                                                                   |
| `MONDIAL_RELAY_ENSEIGNE` / `MONDIAL_RELAY_PRIVATE_KEY`                                                                                                                                                                                                     | Mondial Relay Web Service credentials (see below). Without them, labels are created by hand and the tracking number is typed in the API   |
| `MONDIAL_RELAY_BRAND_CODE`                                                                                                                                                                                                                                 | Brand code used by the pickup point widget (defaults to the enseigne)                                                                     |
| `MONDIAL_RELAY_COLLECT_MODE`                                                                                                                                                                                                                               | `REL` (default, parcel dropped in a pickup point) or `CCC` (collected at your place)                                                      |
| `MONDIAL_RELAY_PARCEL_WEIGHT_IN_GRAMS`                                                                                                                                                                                                                     | Declared weight of the parcel (default 1500)                                                                                              |
| `MONDIAL_RELAY_SENDER_NAME`, `MONDIAL_RELAY_SENDER_ADDRESS`, `MONDIAL_RELAY_SENDER_ADDRESS_2`, `MONDIAL_RELAY_SENDER_POSTAL_CODE`, `MONDIAL_RELAY_SENDER_CITY`, `MONDIAL_RELAY_SENDER_COUNTRY`, `MONDIAL_RELAY_SENDER_PHONE`, `MONDIAL_RELAY_SENDER_EMAIL` | Sender printed on the label                                                                                                               |

### Mondial Relay credentials

The integration uses the Mondial Relay Web Service (SOAP, `https://api.mondialrelay.com/Web_Services.asmx`): `WSI2_CreationEtiquette` to create the shipment and get the label PDF, `WSI2_TracingColisDetaille` to follow the parcel.

With a Mondial Relay **Connect Pro** account, the credentials are in **Mon profil → Mes paramètres de connexion**: the _code enseigne_ (`MONDIAL_RELAY_ENSEIGNE`, 8 characters), the _code marque_ (`MONDIAL_RELAY_BRAND_CODE`, used by the widget) and the _clé privée_ (`MONDIAL_RELAY_PRIVATE_KEY`). If they are not displayed, ask Mondial Relay support (servicesupport@mondialrelay.fr) to enable the Web Service on the account. The test credentials `BDTEST13` / `PrivateK` can be used to try the API before the account is enabled (the shipments created are not real).

### Pickup point widget on the tracking page

The website only needs the tracking token from the email. The `mondial_relay` object returned by `GET /starter-kit/orders/:token` gives the brand code, country and postal code to initialize the [Mondial Relay widget](https://widget.mondialrelay.com/parcelshop-picker/) (jQuery + Leaflet). The token gives access to the order (and to the SSH password once the parcel is shipped), and the widget is a third-party script running in the same page: pin the script versions, and isolate the widget in an iframe that only receives the country and postal code if you prefer to keep the token out of its reach.

```html
<div id="pickup-point-widget"></div>
<input id="pickup-point-id" type="hidden" />
<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
<script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
<script src="https://widget.mondialrelay.com/parcelshop-picker/jquery.plugin.mondialrelay.parcelshoppicker.min.js"></script>
<script>
  const token = new URLSearchParams(location.search).get('token');
  // The token is the only credential of the page: remove it from the URL once read
  history.replaceState(null, '', location.pathname);
  const api = 'https://api.gladysgateway.com';
  fetch(`${api}/starter-kit/orders/${token}`)
    .then((res) => res.json())
    .then((order) => {
      $('#pickup-point-widget').MR_ParcelShopPicker({
        Target: '#pickup-point-id',
        Brand: order.mondial_relay.widget_brand_code,
        Country: order.mondial_relay.country,
        PostCode: order.mondial_relay.postal_code,
        ColLivMod: '24R',
        NbResults: 7,
        Responsive: true,
        OnParcelShopSelected: (point) =>
          fetch(`${api}/starter-kit/orders/${token}/pickup-point`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: point.ID,
              name: point.Nom,
              address_1: point.Adresse1,
              address_2: point.Adresse2,
              postal_code: point.CP,
              city: point.Ville,
              country: point.Pays,
            }),
          }),
      });
    });
</script>
```
