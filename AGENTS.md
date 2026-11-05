# hacker.living

- Recommendations originate with members of the Hacker News community. Product messaging must give the community and individual recommenders credit; the builder organizes and verifies their discoveries.
- Keep the original author, exact HN comment/discussion links, recommendation date, and independently dated official-link check. Editorial or model paraphrases must not appear as direct quotations.
- One person's recommendation is not community consensus. Do not invent popularity, votes, rankings, or endorsement by HN/Y Combinator. Acknowledge the project is independent.
- Show the maker as `grandimam`; link to `https://x.com/thegrandimam`. Maker promotion is secondary to the community's contributions.
- Use React, strict TypeScript, and Tailwind utilities. Do not add custom component CSS. Preserve the local development workflow; do not deploy unless requested.
- Model labeling uses the existing authenticated Codex app server. An optional Pi RPC pool may use the existing EasyCLIProxy Claude login alongside Codex. Do not require model API keys or route through OpenRouter.
- Candidates and model labels are not published places. Preserve provenance and explicit verification gates. Pipeline work must be resumable and must not silently discard failures.

- PostgreSQL/PostGIS is the source of truth for the product catalog, HN evidence, proposals and pipeline jobs. The research preview reads `/api/discoveries` with explicit draft status; `/api/places` remains the approved catalog. Unlocated proposals stay in the list without pins. JSON is an optional export, never a runtime fallback. Keep credentials server-side in ignored `.env`.
- Raw HN archive files remain in Parquet and are processed with DuckDB. Never seed the product database with the former hand-curated catalog. Test fixtures and ignored backups are separate from product data.
