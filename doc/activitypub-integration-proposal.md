# ActivityPub integration proposal

**Status: Direction agreed on 21 October 2026; implementation not started.**
This proposal records how OpenAthlete could become a federated fitness server,
using Open Pace as a planning reference and evaluating Fedify as the protocol
foundation. No federation endpoints, migrations or production changes have been
implemented. Implementation requires a separate request.

## Intended experience

An athlete can enable a federated identity, publish selected completed activities
and be followed from compatible servers. Initial posts contain a readable ride
summary, an optional privacy-filtered map image and a link to the published ride.
Following feeds, replies and likes can follow later.

Posting through an existing Mastodon account is a smaller alternative for sharing
ride summaries. Native federation instead makes the OpenAthlete profile itself
followable and keeps its publications and follower relationships in OpenAthlete.
The agreed direction is to investigate native federation. Neither approach alone
establishes rich fitness-data interoperability with FitPub.

## Reference projects and assessment

The source review used these revisions:

- [Open Pace `5f46f4a`](https://github.com/myfear/open-pace/tree/5f46f4ac9407dba51f0bc2bb62c6c03709c9914a)
- [FitPub `84beabf`](https://codeberg.org/fitpub/fitpub/src/commit/84beabf4f1e2cf870ab1741fc84cbeeb1981daf3)

Open Pace is principally a blueprint at that revision. Its
[ten-sprint roadmap](https://github.com/myfear/open-pace/blob/5f46f4ac9407dba51f0bc2bb62c6c03709c9914a/README.md)
covers an entire fitness application, including authentication, maps, analytics
and equipment. OpenAthlete already has substantial infrastructure in those areas;
reimplementing all ten sprints is unnecessary. Open Pace uses Java/Quarkus, so its
architecture is a reference rather than a drop-in implementation for our
TypeScript/NestJS backend.

[Fedify](https://fedify.dev/) is the preferred candidate to evaluate for discovery,
ActivityPub objects, signatures and delivery. It does not provide the finished
social UI, publication permissions or application data model. Verify NestJS/Express
integration, persistence, queue behavior and supported signatures before adopting
it. Reuse OpenAthlete's existing authentication and PostgreSQL/Redis infrastructure
where appropriate. Server-to-server federation can be added without implementing
ActivityPub client-to-server APIs or replacing existing web/mobile APIs.

## FitPub compatibility findings

Compatibility has distinct layers: account discovery and follows, ordinary social
posts, and rich fitness data. Implementing ActivityPub does not guarantee all three.
The inspected [FitPub federation documentation](https://codeberg.org/fitpub/fitpub/src/commit/84beabf4f1e2cf870ab1741fc84cbeeb1981daf3/docs/federation.md)
and source establish these constraints:

| Area | Open Pace proposal | FitPub at the inspected revision |
| --- | --- | --- |
| Activity representation | Custom sports types such as `Run` and `Ride`, with an example sports vocabulary | Standard `Note` objects with FitPub-specific metadata |
| Rich activity details | Proposed sports fields and track data | Enrichment through `fitpub.detailUri` and a particular activity-details response |
| Following other software | General federation goal | FitPub users can follow remote accounts only when NodeInfo identifies the remote software as FitPub |
| Receiving fitness posts | Proposed handling of custom types | Requires an accepted follow; standalone fitness Notes need a `fitpub` or legacy `fitpubDetailUri` marker |

Therefore, implementing Open Pace's plan unchanged would not guarantee two-way
FitPub interoperability. FitPub's follow restriction requires upstream cooperation
or a supported capability-based alternative. OpenAthlete should identify itself
honestly rather than advertise its software as FitPub to bypass that restriction.

Inbound follows from other ActivityPub software are supported by the inspected
FitPub implementation. The restriction on follows originating in FitPub does not
establish the cause of the user's earlier Mastodon-to-FitPub follow failure; that
specific connection remains undiagnosed.

Start with standard Notes for readable summaries and links. Agree on fitness
extensions and privacy-filtered detail retrieval with FitPub before committing to
its enrichment format. Open Pace's example sports vocabulary is not evidence of
an established shared fitness standard. No live cross-server interoperability test
was performed during this review.

## Proposed milestones and acceptance criteria

1. **Federated identity and follows.** Add optional public usernames, stable actor
   URLs, WebFinger, actor documents, inbox/outbox collections and persistent signing
   keys. Implement signed requests, signature verification, follow acceptance and
   unfollow handling. Accept when a test Mastodon account discovers and follows an
   OpenAthlete actor, and unfollowing updates the relationship correctly.
2. **Publish selected activities.** Add explicit opt-in publishing, public ride
   pages, standard Note summaries and optional redacted map images. Store durable
   publication/delivery state, retry transient failures and propagate edits and
   deletion. Accept when a shared ride reaches followers once despite retries,
   edits retain object identity, and deletion sends the appropriate federation
   activity. Verify every public representation applies the same privacy rules.
3. **Social interactions.** Add a following feed, replies, likes, notifications and
   actor/server blocking. Verify ownership and signature checks, duplicate inbound
   delivery and rejected interactions. Keep remote athletes' activities separate
   from the owner's training history and load calculations.
4. **FitPub interoperability.** Resolve the remote-software follow restriction,
   agree on supported metadata/detail responses and test discovery, follows,
   activity delivery, updates, deletion and selected interactions in both
   directions. Treat readable Mastodon posts and rich FitPub rendering as separate
   acceptance criteria.

Open Pace's [signature strategy](https://github.com/myfear/open-pace/blob/5f46f4ac9407dba51f0bc2bb62c6c03709c9914a/docs/HTTP_SIGNATURES_STRATEGY.md)
postpones server-to-server authentication until a later stage. For OpenAthlete,
signatures and verification belong in milestone one. Sharing controls and data
redaction must precede publication of real activities.

## Privacy and application boundaries

Imported activities remain private by default. Start with manual publication and
a preview of the exact shared title, statistics and map. Publish a separate,
filtered representation; never expose the internal activity DTO or original FIT
file automatically. Route redaction must apply to pages, attachments, detail
responses and federation payloads. Recovery metrics, private notes and training
plans are outside the initial sharing scope.

Public and followers-only publication have different access requirements; verify
recipient authorization before introducing followers-only detail access. Deletion
must remove local public representations and request remote deletion, but cannot
guarantee removal of copies held by another server.

Federation endpoints need signature-based authorization, bounded input, safe remote
fetching, content sanitization and delivery limits. Keep existing account APIs and
permissions intact. Private API data must not become public through new actor,
object or collection endpoints.

## Expected database and deployment scope

Expect additive migrations for federation identities and keys, remote actors,
follow relationships, publication visibility and object IDs, inbound deduplication,
and delivery state. Existing activity storage can remain the source for filtered
publications; a major activity-model rewrite is not currently expected.

Use stable canonical HTTPS URLs and route discovery/federation requests correctly
through the existing reverse proxy. Choose actor identities and public URLs before
publishing, because other servers retain those identifiers. Signups can remain
closed while existing users opt into federation.

The next concrete step is a small Fedify integration proof of concept with a test
actor and a Mastodon follow round trip. Recheck both projects' current revisions
and FitPub's policy before beginning. Deployment is a separate decision after
protocol, privacy and existing-login regression checks pass.
