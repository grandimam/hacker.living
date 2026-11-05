# hacker.living

Your next good detour. The first collection is **Places**: real recommendations from Hacker News, with the original comment, recommendation context, and a dated official link. The homepage opens directly into Places.

## Run locally

Requires Node.js 22.12 or newer. The frontend uses React 19, TypeScript, Vite, React Router, and Tailwind CSS 4. Leaflet provides the map; Lucide supplies icons. No API key is required for the initial collection.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4317. Set `PORT` to use another port.

React source lives in `src/`, shared types and filter logic in `shared/`, and static photographs in `public/`. `data/places.json` is the canonical reviewed dataset. The development preparation and production build validate it and copy it into `public/places.json`. `npm run build` bundles the frontend into `dist/` and generates static index files for deep links. `dist/` is generated output and can be rebuilt.

All application styling uses Tailwind utility classes. `src/index.css` contains the Tailwind import and theme tokens only; there are no handwritten component CSS rules. Leaflet ships its own required library stylesheet. Reusable UI elements live in `src/components/`, with page components in `src/pages/`.

## Implemented experience

- Places-first homepage matching the approved redesign: a compact editorial heading, explicit Search and Near me actions, simple numbered recommendation rows, and a synchronized map.
- Places map with synchronized recommendations, category and city filters, full-text search, sorting, map-area search, and a list view.
- “Near me” asks for permission on click and computes distances locally, within 100 km. The initial coverage is primarily London; empty nearby results explicitly explain that coverage.
- Whole-row place links and matching numbered pins connect the list to the map. The selected place has a compact panel with Plan a visit and the HN discussion; visiting details, source excerpts, and recommendation context expand on demand.
- Stable deep links such as `/places/crossness`; static index files are generated for all published places.
- Saved places in browser local storage, with corrupted-storage recovery and cross-tab synchronization.
- Responsive layout: desktop opens with the London map and a selected Crossness card; mobile starts with useful place recommendations and a map toggle. Keyboard focus styles, Escape to close details, reduced-motion support, loading and empty states are included.
- Self-hosted, licensed Commons photography with source and license links on `/credits`.

The initial collection has ten reviewed places. Building-level coordinates are not verified accessible entrances. Link checks establish that the official URL returned a page on the given date; they do not establish current opening hours or admission conditions.

## TypeScript

All application code, shared domain logic, pipeline commands, build utilities, and tests use TypeScript. `npm run check` runs strict type checking across `src/`, `shared/`, `scripts/`, `tests/`, and the Vite configuration. Node scripts and tests execute through `tsx`; external JSON is validated at runtime before becoming typed pipeline records. Published places and incomplete review drafts have separate types. The frontend re-exports its domain types from `shared/types.ts`, so there is one definition for each record.

## Content pipeline

The pipeline is an on-demand CLI. It does not run in the visitor’s browser and is not yet scheduled. No candidate is automatically published. Discovery and publication work without an LLM. An optional Codex app-server pilot labels staged comments before an editor resolves the actual entity and location.

```text
Algolia HN search
  → preserve original search evidence and deduplicate comment IDs
  → identify possible recommendation comments and suggest place names
  → candidate review queue
  → editable place draft
  → manual entity, location, and recommendation review
  → canonical HN API check and official HTML link check
  → merge duplicate places and preserve additional recommendation sources
  → approved data/places.json
  → validated static build
```

### 1. Discover

```sh
npm run pipeline:discover
npm run pipeline:discover -- --query "observatory worth visiting" --pages 2 --limit 25
npm run pipeline:review
```

Search results are archived under `data/runs/`. Candidates live in `data/candidates.json` and are deduplicated by comment ID across reruns and query overlap. Already-published evidence is marked accordingly. A failed query is recorded and exits nonzero; successful queries are retained. Known rejected candidates are not silently reintroduced.

### Optional: measure recommendation yield with Codex

The labeler connects to the **already-running local Codex app server** over its Unix-socket WebSocket transport and your existing Codex login. It does not need an API key or Claude. Codex usage limits still apply. The model is inherited from your local configuration and recorded per batch.

```sh
npm run pipeline:label-pilot -- --prepare-only
npm run pipeline:label-pilot
```

This reproducibly samples 150 pending comments across mutually exclusive query groups. Small groups are oversampled; the report weights their results back to the candidate population. Full source text and the queue hash are saved in `data/labeling-pilot/sample.json`. Comments are treated as untrusted source data, with a read-only classification thread and no tool use requested. Each batch gets a fresh ephemeral thread; only this client is disconnected afterward, leaving the shared daemon running.

Structured output must cover every comment exactly once. The validator rejects missing/duplicate IDs, fabricated or excessive quotations, and inconsistent recommendation labels. Batch outputs and token usage notifications are saved locally; validated batches are reused on reruns when their prompt/schema hash matches. Failed batches remain retryable. Run only one pilot process at a time.

`data/labeling-pilot/report.json` reports useful-comment yield, weighted population projection, decisions, and preliminary named entities. These are model classifications, not verified places: missing locations and aliases still need review. The estimate applies to the retrieved queue, not all HN, and does not estimate the total number of unique places. The pilot never changes candidates' review status or publishes pins.

### 2. Draft and review

```sh
npm run pipeline:draft -- --candidate hn-49032046 --out data/drafts/new-place.json
```

The draft command fetches the actual comment and walks its parents through the official HN API to identify the original story. Edit the draft JSON: resolve a precise place, choose a slug/category, add city/country, coordinates and a coordinate source, official URL, description, visitor note, and a faithful recommendation paraphrase. Quotes are optional and limited to 25 words. Name suggestions can be incomplete or include irrelevant words; they are never treated as verified entities.

After inspecting the source and location, explicitly set:

```json
"review": {
  "status": "draft",
  "locationVerified": true,
  "recommendationVerified": true
}
```

### 3. Approve

```sh
npm run pipeline:approve -- --file data/drafts/new-place.json --reviewer "Your name"
npm run check
npm run build
```

Approval refuses incomplete records. It re-fetches canonical HN evidence, checks author/date/story IDs, validates exact quote excerpts, rejects deleted/dead comments, and checks that the official URL returns an HTML page. The reviewer, approval timestamp, source evidence, and link-check result are retained in `data/reviews/`.

If a normalized place name/city or canonical official URL matches within 1 km, the pipeline merges recommendation evidence into the existing place rather than adding another pin. Branches far apart are retained separately. Existing primary recommendations remain visible; additional evidence is preserved in `sources` for future display. Different places cannot overwrite the same slug. All dataset writes are atomic. Run only one mutating pipeline process at a time.

Approval updates the reviewed source dataset; it does not deploy the site. Run the build to generate the static files in `dist/`.

To reject a candidate while retaining evidence:

```sh
node --import tsx scripts/pipeline.ts reject --candidate hn-49032046 --reason "Not a specific place recommendation"
```

### 4. Recheck official links

```sh
npm run pipeline:verify
npm run pipeline:verify -- --place crossness
npm run build
```

Successful HTML responses update the last-successful official-link date. Failures leave that date unchanged, write a report to `data/link-checks.json`, and exit nonzero. A successful response is a link check; an editor still needs to verify the place’s identity, visiting details, and continued existence. No automatic geocoder is used; map coordinates are reviewed explicitly against the stored coordinate source.

### Validation

```sh
npm run check
npm test
npm run build
```

Tests cover searches, category/region/save filters, distance and map bounds, broken local storage, publication gating, duplicate resolution, canonical HN parent chains, deleted comments, link-check errors, unsafe URL redirects, and network retries. Live ingestion was tested with `Crossness`, and canonical draft retrieval plus an official-link verification were exercised separately.

## Hosting and external services

The source repository is [grandimam/hacker.living](https://github.com/grandimam/hacker.living). Development runs locally; this repository does not automatically deploy the site. `npm run build` creates a static site in `dist/` for a host of your choice. Connecting the **hacker.living** domain requires domain ownership and DNS configuration, which this implementation does not change. Local hosting metadata, credentials, dependencies, build output, and ingestion/labeling run caches are excluded from version control.

Leaflet 1.9.4 is installed through npm and bundled by Vite with its library CSS. The browser requests map tiles directly from OpenStreetMap, with visible attribution, normal browser caching, and no offline or bulk tile prefetch. This small first release uses the public service; configure a suitable tile provider before sustained large-scale traffic. The tile URL is in `src/components/PlacesMap.tsx`. The interface fonts load from Google Fonts, with local serif/sans fallbacks. All place photos are local; their credits are in `public/assets/photos/attributions.json`.

## Next steps

Broader geographic coverage, a visual editor for the review queue, optional assisted entity extraction/geocoding, and scheduled discovery after reviewing initial precision.

## License and attribution

Project code is released under the MIT license in `LICENSE`. Photographs retain the individual licenses listed in `public/assets/photos/attributions.json`. HN recommendations retain their original author and discussion attribution.
