# Facebook webhook ingress

This deployment serves one configured Facebook Page. The local adapter and database transaction are implemented in OV-013; live Page verification remains tracked separately in [OV-051](../tasks/onevoice/OV-051-facebook-ingress-live-verification.md).

## Server configuration

Set `FACEBOOK_PAGE_ID`, `FACEBOOK_APP_SECRET` and a separate random `FACEBOOK_VERIFY_TOKEN` in the server environment. These values must never use a `NEXT_PUBLIC_` prefix or appear in browser code/logs. The Supabase URL, service credential and installation organization must also be configured. Ingress does not require an AI provider.

Expose `/api/webhooks/facebook` at the deployment's public HTTPS origin. Enter that callback URL and the same verify token in the Meta app's webhook configuration. The GET handler validates the verification request and returns its challenge. POST requests are accepted only after validating `X-Hub-Signature-256` against the exact raw bytes using the app secret.

Only events for the configured Page are persisted. The endpoint waits for the inbox/outbox transaction before acknowledging delivery. It limits body size, event count, normalized storage size and processing time. A retry after an uncertain response is safe because the provider event identity is deduplicated. Echoes are retained without queuing an AI response.

The projection/classification/outbound worker is separate from this endpoint. A successful webhook response alone does not establish that OneVoice can answer a customer.

## Local verification

Use a running local Supabase instance at `http://127.0.0.1:54321`. The integration test refuses remote database targets and uses synthetic signed events:

```powershell
$env:ONEVOICE_LOCAL_WEBHOOK_TEST = '1'
node node_modules/vitest/vitest.mjs run src/lib/channels/facebook --maxWorkers=1 --no-file-parallelism
```

The local SQL tests additionally verify privilege boundaries and transactional event/job deduplication. These tests do not subscribe a real Page or send a message.

## Live release evidence

Complete OV-051 with the actual app/Page permissions, HTTPS callback verification, Page subscription, signed delivery and duplicate handling. Record sanitized event identifiers and results; do not store secrets or real customer message bodies as test evidence. Confirm current Meta access requirements for users outside the app's tester/admin roles.

Provider contracts checked on 2026-09-12: [Messenger webhooks](https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks) and [Graph API webhook setup](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/). The current Messenger documentation requires acknowledgement within five seconds; this implementation uses a four-second request deadline. App role testing and access to ordinary customers are separate permission cases.
