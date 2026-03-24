# Dead Ringer

Dead Ringer is a static Vercel-ready quote game built around a large cited corpus of real public-domain source texts.

## What changed

- Replaced the small hardcoded quote array with a generated 5,000+ quote corpus in `data/generated/`.
- Added a corpus build pipeline that validates source metadata, extracts quote candidates from public-domain texts, deduplicates records, and emits chunked JSON plus a manifest.
- Expanded gameplay from a binary `murderer vs politician` prompt to 4-choice rounds across broader organization families.
- Added pack and family filters, citation reveal, and a larger institutional taxonomy.

## Local development

```bash
npm start
```

## Corpus workflow

```bash
npm run build:corpus
npm run check
```

The build script downloads public-domain source texts, generates normalized quote records, and writes static JSON files that the browser app loads at runtime.

## Deployment check

- Confirm `data/generated/manifest.json` exists before deploying.
- After deploy, verify `/data/generated/manifest.json` and one `quotes-*.json` URL both return `200 OK`.
