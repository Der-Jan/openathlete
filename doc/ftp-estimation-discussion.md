# Automatic FTP estimation discussion

**Status: Deferred, with no concept selected.** Last discussed on 20 October
2026. The user is not satisfied with the current concept and wants to revisit
it after considering the alternatives. Implementation should wait for that
direction.

Feature branch: `feat/automatic-ftp-estimation`, based on upstream main.
Only discussion notes have been added; no estimator, database migration, or
deployment has been implemented for this feature.

## Motivation

Explore activity-based estimated functional threshold power (eFTP), inspired by
Intervals.icu and Xert. The initial interest was detecting FTP changes from hard
activities without requiring a dedicated FTP test every time.

## Existing foundations

OpenAthlete already stores activity power streams and duration-based power
records, including 5, 10, 20, 30, and 60 minute efforts. It stores configured
cycling FTP as a dated `FTP_CYCLING` metric and uses FTP for relative workout
targets. It does not currently infer FTP automatically from those efforts.

Relevant code:

- [Power record calculation](../apps/api/src/modules/core/helpers/record.ts)
- [Activity record processing](../apps/api/src/modules/core/services/activity-records.service.ts)
- [Record database model](../libs/database/prisma/schema/record.prisma)
- [Metric database model](../libs/database/prisma/schema/metric.prisma)
- [Metric calculation configuration](../libs/shared/src/utils/metric-calculation.map.ts)

## Options discussed

These are alternatives to revisit, not an agreed specification:

- Estimate eFTP from an individual ride's informative power efforts.
- Estimate current athlete eFTP from several activities and a power-duration
  model. No particular model or estimation formula has been chosen.
- Keep estimates separate from configured FTP, and let the athlete accept a
  suggested change. Optional automatic updates were also discussed.
- Calculate estimates on demand from existing data. A dedicated estimate table
  is not inherently necessary. Persisting estimates would instead support
  historical reproducibility, acceptance decisions, and auditability.
- Return supporting activities and efforts, method/version, and an indication
  of whether the available data supports an estimate. The meaning and validation
  of any confidence indicator remain open.

Updating configured FTP and updating explicitly stored power-zone boundaries
would be separate decisions; changing an FTP metric does not automatically
define how every zone should be recalculated.

## Concern with low intensity training

The user challenged the rolling-window approach: during a block consisting
only of low-intensity training, earlier informative efforts could fall outside
the window. The resulting lack of recent maximal efforts should not, by itself,
be interpreted as evidence that FTP has decreased.

An alternative discussed was retaining the last supported estimate, showing
its age and source, and returning insufficient evidence for uninformative
rides. However, a historical estimate also does not establish current fitness.
The user did not accept this alternative as the final concept either.

## Questions to revisit

1. Is the main result an estimate for each ride, a current athlete estimate,
   a suggestion to change configured FTP, or some combination?
2. Which model and effort durations would provide useful estimates, and how
   would they be validated against known performances?
3. What should happen during long low-intensity blocks, detraining, illness,
   or extended gaps in usable power data? Should estimates age, decay, remain
   visible as historical evidence, or become unavailable?
4. What evidence should support increases and decreases, and which changes
   should require athlete confirmation?
5. Should historical estimates change when the algorithm changes, or should
   estimates and their model versions be stored?
6. How should power spikes, recording gaps, equipment changes, corrected
   activities, and deleted activities affect the result?

Resume by deciding the intended behavior and reviewing representative rides,
including a long low-intensity block. Database changes should follow the chosen
behavior rather than determine it in advance.

## Comparison references

- [Intervals.icu](https://www.intervals.icu/)
- [Xert FTP estimation example](https://www.xertonline.com/whats-my-ftp)

These products motivated the discussion; matching either product's algorithm
or behavior has not been selected as a requirement.
