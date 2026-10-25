# PHI Mobile Schedule Access Setup

PHI credentials and released mobile schedules are stored in MongoDB. The planning database remains SQLite and is still the source for the PHI roster and task scoring; MongoDB is used only for PHI accounts and confirmed schedule publication.

## Configure the API

For local development, the API defaults to `mongodb://localhost:27017` when `APP_ENV` is unset or set to `development`. If `PHI_JWT_SECRET` is also unset, the API creates and reuses a random development key at `component_3_phi_planning/api/output/.phi_jwt_secret`. This file is ignored by Git and must be preserved between restarts so mobile sessions remain valid.

For production, explicitly set `APP_ENV=production` and configure these environment variables on the API host:

- `MONGODB_URI`: MongoDB connection string. Use a dedicated database user with access only to the app database and TLS enabled for hosted MongoDB.
- `MONGODB_DATABASE`: optional database name; defaults to `dengue_guardian`.
- `PHI_JWT_SECRET`: a cryptographically random secret of at least 32 bytes. Keep it private and stable across API restarts so issued tokens remain valid until expiry.

Do not commit secrets or place them in the mobile app. The mobile app receives only short-lived bearer tokens after login. Never use the automatic development secret in production.

The first MongoDB connection creates unique indexes for PHI IDs and schedule dates. Collections used are `phi_accounts` and `phi_released_schedules`.

## Provision PHI accounts

There is no public signup endpoint. Provision or reset each account from the API host, where the PHI roster database is available:

```powershell
$env:MONGODB_URI = "<MongoDB connection string>"
$env:PHI_JWT_SECRET = "<random secret>"
.\.venv\Scripts\python.exe -m component_3_phi_planning.api.provision_phi PHI01 --display-name "PHI Name"
```

The command verifies the PHI ID against `PHI_Master`, prompts for a password twice without echoing it, and stores a PBKDF2-HMAC-SHA256 password hash. Set at least 12 characters. Re-running the command resets that PHI's password and reactivates the account.

To disable an account, set its `active` field to `false` in `phi_accounts`; access is checked against MongoDB on every request, so the account is immediately rejected.

## Publish schedules

Generate and review the day's schedule in the web dashboard as usual. **Confirm Revised Schedule** publishes only tasks with status `Scheduled` and a non-empty PHI assignment. Every mobile read is filtered again by the authenticated PHI ID. Draft, unscheduled, and other PHIs' assignments are not returned.

If a date is regenerated or adaptively rescheduled after release, its previous mobile publication is revoked. The revised version becomes available only after it is confirmed again. Confirmation publishes the plan to the app but does not send a push notification or message.

## Configure the mobile app

For repeat use, store the mobile URLs in `clients/phi_mobile_app/.env` (this local file is Git-ignored). Copy `.env.example` as a starting point and replace the LAN IP with the current IP of the computer running the API:

```powershell
cd clients/phi_mobile_app
npm start
```

Expo loads the `EXPO_PUBLIC_*` values from that project `.env` at startup. Restart Expo after changing the file. Keep the API and Expo in separate terminals. For hosted production use HTTPS and configure the friend's real notification receiver URL; do not use the local test endpoint in a production app.

For a physical phone during local development, use the computer's LAN IP instead of `127.0.0.1` and make sure the phone can reach the API. Use HTTPS outside local development. The mobile app stores its bearer token in Expo SecureStore and clears it on sign-out or when the API reports that the session is expired/invalid.

## API routes

- `POST /api/v1/phi/login`: PHI ID and password; returns an 8-hour signed bearer token.
- `GET /api/v1/phi/schedules/dates`: returns only dates with a released schedule for the authenticated PHI.
- `GET /api/v1/phi/schedules/{YYYY-MM-DD}`: returns only that PHI's scheduled tasks for that released date.
- `POST /api/v1/phi/tasks/{task_id}/inspection/start`: marks the PHI-owned task In Progress; a completed task may be revisited only when its latest report requested follow-up.
- `GET /api/v1/phi/tasks/{task_id}/inspection`: returns the caller PHI's draft and immutable submitted reports for the assigned task.
- `PUT /api/v1/phi/tasks/{task_id}/inspection/draft`: saves a validated resumable report draft.
- `POST /api/v1/phi/tasks/{task_id}/inspection/submit`: idempotently submits a report and updates PHI task execution status.

## Privacy and limitations

Inspection reports live in MongoDB collection `inspection_reports`. PHI report access is filtered by token PHI ID and released-task ownership. Submitted reports are immutable. Follow-up reports use new submission IDs and coexist with prior reports; retries using the same ID return the original report.

PHIs should record only information needed for authorized case investigation. Photo capture, GPS permission/capture, offline server synchronization, and production identity governance are not implemented. A disconnected report remains in encrypted device draft storage and cannot be marked complete until server submission succeeds. Existing priority formulas are unchanged. Source tasks may include synthetic/provisional planning data; submissions do not establish a reduction in dengue incidence.

## Prevention notification integration contract

No receiver from the friend's Prevention component was found in this repository. For local testing only, this repo now includes a separate **Development Notification Test** receiver and temporary viewer. It is not the friend's dashboard, does not implement prevention rules, and is disabled when `APP_ENV=production`.

For local test mode, set `PREVENTION_NOTIFICATION_TEST_MODE=true` for the API and set the mobile app URL to the API host that the phone can reach. Open the temporary viewer at `http://localhost:5173/dashboard/notification-test` (use the actual Vite port if it differs):

```powershell
# API terminal; APP_ENV should remain development or test.
$env:PREVENTION_NOTIFICATION_TEST_MODE = "true"

# Expo terminal; replace the LAN address with the computer's reachable IP.
$env:EXPO_PUBLIC_PREVENTION_NOTIFY_URL = "http://192.168.1.20:8000/api/v1/dev/prevention-notifications"
```

Open the temporary viewer at `http://localhost:5173/dashboard/notification-test` and tap **Notify Prevention Team** after submitting an inspection. The receiver requires the PHI bearer token, checks the PHI reference, persists only the minimal notification fields in MongoDB collection `prevention_notification_test_events`, and deduplicates by `Idempotency-Key`/inspection ID. Its viewer GET is limited to loopback clients and development/test mode. The mobile app remembers successful report IDs in SecureStore; a failed request leaves the saved report intact and can be retried.

To integrate with the friend's real Prevention dashboard, she must provide the existing receiver URL and confirm it accepts the same authenticated `POST`, idempotency header, and minimal fields: `inspection_id`, `task_id`, `location`, `inspection_date`, `phi_reference`, `issue_description`, and `notification_timestamp`. Do not include patient names, contact details, laboratory information, site-level address descriptions, or the full inspection report. No request is sent to her dashboard until its actual URL is configured.
