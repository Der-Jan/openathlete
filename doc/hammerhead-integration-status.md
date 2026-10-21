# Hammerhead activity integration status

**Status: Deferred at the user's request on 21 October 2026.** Resume only when
requested. This is a feasibility investigation; no Hammerhead connector, account
connection, database migration or deployment has been implemented.

## Intended behavior

Import completed rides directly from Hammerhead Karoo into OpenAthlete, including
historical activities and available sensor/GPS data. The purpose is to remove the
dependency on Strava. Direct imports must coexist with existing Strava, Garmin and
HealthKit copies without counting the same ride twice.

## Official integration path

Hammerhead documents a public API and a developer-account setup process. Its
[developer account guide](https://support.hammerhead.io/hc/en-us/articles/43558376710683-Creating-a-Developer-Account)
links to [developer signup](https://dashboard.hammerhead.io/partner/signup) and
[API documentation](https://api.hammerhead.io/v1/docs). The guide lists client ID,
client secret, redirect URLs, webhook secret and webhook URLs as developer
settings. A native OpenAthlete connector should use account authorization and
securely stored tokens.

The published [API licence](https://support.hammerhead.io/hc/en-us/articles/42738760915099-API-Licence-Document)
includes business-purpose wording. Confirm eligibility for a personal self-hosted
instance before relying on this path; the documented signup process alone does
not settle that question.

Hammerhead also supports downloading completed rides as FIT files from its
[Dashboard](https://support.hammerhead.io/hc/en-us/articles/360003096654-Dashboard-Downloading-a-FIT-file).
A representative export provides a way to check compatibility with OpenAthlete's
existing FIT parser before building account sync.

## GitHub references

| Project | Relevant capabilities | How to use it when resuming |
| --- | --- | --- |
| [saesh/hammerhead-go](https://github.com/saesh/hammerhead-go) | Go library with OAuth authorization-code flow, token refresh, paginated activity listing, activity details and FIT downloads. Also exposes routes and workout operations. Repository identifies an MIT licence. | Preferred API reference for a native TypeScript provider. The inspected activity source implements listing and FIT-download requests; live API behavior still needs validation. |
| [hartenbergerma/hammerhead2garmin](https://github.com/hartenbergerma/hammerhead2garmin) | Python service that downloads Hammerhead activities as FIT files and uploads them to Garmin Connect. Documents daily GitHub Actions execution and persisted incremental sync state. Requires Hammerhead developer credentials; its configuration also requests account usernames/passwords. | Reference for the collection workflow. Review its actual authentication implementation before adopting any approach; do not assume it uses browser consent merely because its README mentions OAuth. |
| [rolanddb/karoo-garmin-sync](https://github.com/rolanddb/karoo-garmin-sync) | Python synchronizer using a username/password grant against dashboard endpoints, activity pagination and FIT downloads. Repository identifies an Apache-2.0 licence. | Reference for an unofficial fallback. Current endpoint compatibility is unverified. |

These are third-party projects, not Hammerhead-maintained connectors. Documentation
and selected source files were inspected; none was run against a real account.
Check current revisions, licences and API compatibility before reusing code.
Karoo device extensions are a separate integration route and are not needed for
the proposed server-side connector.

## Proposed OpenAthlete implementation

Add a Hammerhead provider to Settings > Connectors, with account authorization,
secure token storage/refresh and stable provider activity IDs. Use background jobs
for historical imports and webhook-triggered updates. Download original FIT files
where supported and feed them through the existing activity parser.

Reuse the shared activity-source reconciliation introduced for HealthKit. Matching
must work with either provider arriving first, and retries must be idempotent.
Keep one canonical activity while retaining source identities and provenance.
Enrichment must preserve user edits, feedback and training-plan links, and must
not double-count distance, energy or training load. Ambiguous matches should enter
a review state rather than being silently merged.

The expected scope is provider wiring and small schema additions, subject to API
validation. A major activity-model redesign is not currently expected.

## Next steps when resumed

1. Recheck the official API, personal-instance eligibility and developer signup.
2. Review the Go client and Python sync examples against the current API contract,
   especially authorization, refresh, pagination, webhook events and FIT retrieval.
3. With locally supplied credentials, connect one account and import one real
   ride. Compare timestamps, pauses, laps, GPS, power, heart rate and cadence with
   the source file, preserving missing channels rather than inventing values.
4. Establish history limits, rate limits, token behavior and webhook verification.
5. Test duplicate matching in both arrival orders, lost acknowledgements, retries
   and concurrent imports, including preservation of edits and training links.
6. Add automatic synchronization after the single-ride path is verified. Keep
   implementation and deployment as separate decisions when the topic resumes.
