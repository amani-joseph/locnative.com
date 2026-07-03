# Dashboard UI — Phase 5: Docs / Explorer Update — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Document the 16 new public API endpoints (forward geocode, batch, zones, devices, webhooks) across the four existing hand-authored docs layers, with GET endpoints executable in the try-it explorer and POST/PUT/DELETE shown as curl examples.

**Architecture:** Pure additive edits to the existing hand-maintained docs surfaces — no router/runtime/proxy changes. The OpenAPI spec (`openapi.ts`), the docs page endpoint catalog (`docs-page.tsx`), and the explorer endpoint catalog (`api-explorer-endpoints.ts`) are each extended with new entries following the patterns already present for the 4 original address endpoints. The explorer try-it proxy stays GET-only (confirmed scope).

**Tech Stack:** TanStack Start / React, TypeScript. No DB, no migration, no new dependency. Independent of Phases 2/3 (touches only docs files).

**Spec:** `docs/superpowers/specs/2026-06-04-dashboard-ui-geocoding-geofencing-design.md` (Phase 5)
**Research:** `docs/superpowers/research/ui-docs.md` (key finding: OpenAPI is hand-maintained; 4 independent doc layers; try-it is GET-only)

## The 16 public endpoints to document
1. `GET /api/v1/addresses/geocode` — forward geocode (GET, executable)
2. `POST /api/v1/geocode/batch` — submit batch (curl only)
3. `GET /api/v1/geocode/batch/{jobId}` — poll batch (GET, executable)
4. `GET /api/v1/geocode/batch/{jobId}/results` — batch results (GET, executable)
5. `POST /api/v1/zones` — create zone (curl only)
6. `GET /api/v1/zones` — list zones (GET, executable)
7. `GET /api/v1/zones/{id}` — get zone (GET, executable)
8. `PUT /api/v1/zones/{id}` — update zone (curl only)
9. `DELETE /api/v1/zones/{id}` — delete zone (curl only)
10. `GET /api/v1/zones/contains` — point-in-polygon (GET, executable)
11. `GET /api/v1/zones/{id}/addresses` — addresses in zone (GET, executable)
12. `POST /api/v1/devices/{deviceId}/location` — push location (curl only)
13. `GET /api/v1/devices/{deviceId}/zones` — device zones (GET, executable)
14. `POST /api/v1/webhooks` — create webhook (curl only)
15. `GET /api/v1/webhooks` — list webhooks (GET, executable)
16. `DELETE /api/v1/webhooks/{id}` — delete webhook (curl only)

(Plus the new `POST /api/v1/webhooks/{id}/reactivate` if Phase 2 merged first — optional 17th; include only if the endpoint exists at execution time.)

## ⚠️ Pre-flight (Task 0): read the actual structures before editing
The exact shapes of `EndpointDoc` (in `docs-page.tsx`), the explorer catalog entries (`api-explorer-endpoints.ts`), and the OpenAPI object (`openapi.ts`) MUST be read first — copy the existing autocomplete/reverse/nearby/byId entries as templates. This plan gives representative content but the engineer fills each entry to match the established field set exactly.

## File Map
**Modify:**
- `apps/web/src/lib/openapi.ts` — add OpenAPI path objects for the 16 endpoints
- `apps/web/src/components/docs-page.tsx` — add `EndpointDoc` entries + nav anchors + async-lifecycle narrative
- `apps/web/src/lib/api-explorer-endpoints.ts` — add explorer catalog entries (GET executable; others marked docs-only)

---

## Task 0: Read the existing doc structures (no commit)

- [ ] **Step 1:** Read all three files fully and record the exact templates:
```bash
cat /Users/mac/Developer/projects/locnative.com/apps/web/src/lib/openapi.ts
cat /Users/mac/Developer/projects/locnative.com/apps/web/src/lib/api-explorer-endpoints.ts
sed -n '70,200p' /Users/mac/Developer/projects/locnative.com/apps/web/src/components/docs-page.tsx
```
Note: the `EndpointDoc` interface fields (title, href, method, path, summary, description, notes[], params[], curl, exampleResponse, etc.), the explorer entry shape (and how it marks GET vs non-GET / executable), and the OpenAPI path object shape. Use the autocomplete entry as the canonical template for each. Confirm the field names before Task 1.

---

## Task 1: OpenAPI spec — add the 16 paths

**Files:** Modify `apps/web/src/lib/openapi.ts`

- [ ] **Step 1:** For each of the 16 endpoints, add a path entry to the OpenAPI `paths` object, matching the existing entries' shape (operationId, summary, tags, parameters with in/name/required/schema, requestBody for POST/PUT, responses). Group tags: `addresses` (geocode + batch), `zones`, `devices`, `webhooks`. Use the actual request/response shapes from `packages/sdk/src/types.ts` (ForwardGeocodeResponse, BatchGeocode*, ZoneRecord/ZoneWithGeometry/ZoneContainsResponse/ZoneAddressesResponse, DeviceZonesResponse, WebhookCreateResponse, etc.).

Representative entry (forward geocode) — adapt to the file's exact structure:
```typescript
	"/api/v1/addresses/geocode": {
		get: {
			operationId: "forwardGeocode",
			summary: "Forward geocode an address",
			tags: ["addresses"],
			parameters: [
				{ name: "q", in: "query", required: false, schema: { type: "string", minLength: 5 }, description: "Unstructured address text (min 5 chars)." },
				{ name: "structured", in: "query", required: false, schema: { type: "string", enum: ["true", "false"] } },
				{ name: "street", in: "query", required: false, schema: { type: "string" } },
				{ name: "locality", in: "query", required: false, schema: { type: "string" } },
				{ name: "state", in: "query", required: false, schema: { type: "string" } },
				{ name: "postcode", in: "query", required: false, schema: { type: "string" } },
				{ name: "country", in: "query", required: false, schema: { type: "string" } },
			],
			responses: {
				"200": { description: "Best-matching address with coordinates." },
				"404": { description: "No address found." },
			},
		},
	},
```
Repeat for all 16, with correct method, path params (`{id}`, `{jobId}`, `{deviceId}`), request bodies for POST/PUT, and tags.

- [ ] **Step 2: Type-check + commit**

```bash
cd /Users/mac/Developer/projects/locnative.com/apps/web && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -i "openapi" || echo "no openapi errors"
git -C /Users/mac/Developer/projects/locnative.com add apps/web/src/lib/openapi.ts
git -C /Users/mac/Developer/projects/locnative.com commit -m "docs(web): add 16 new endpoints to OpenAPI spec"
```

---

## Task 2: Docs page — endpoint entries + nav + narrative

**Files:** Modify `apps/web/src/components/docs-page.tsx`

- [ ] **Step 1:** Add an `EndpointDoc` entry to the `endpointDocs` array for each of the 16 endpoints, copying the field set from the existing autocomplete entry exactly (title, href anchor, method, path, summary, description, notes, params, curl example, exampleResponse). Use real example requests/responses. For GET endpoints include a runnable curl with `X-API-Key`; for POST/PUT/DELETE include a curl with `-X <METHOD>` and a JSON `-d` body where applicable.

- [ ] **Step 2:** Add corresponding nav anchors to the docs sidebar/section list (the array that currently lists `{ title: "Autocomplete", href: "#autocomplete" }`, etc.) — one per new endpoint, grouped under section headers "Geocoding", "Zones", "Devices", "Webhooks".

- [ ] **Step 3:** Add a short async-lifecycle narrative block for the two multi-step flows:
- **Batch:** submit (`POST /geocode/batch` → `jobId`) → poll (`GET /geocode/batch/{jobId}` until `status: completed`) → fetch results (`GET /geocode/batch/{jobId}/results`).
- **Webhooks delivery:** on a zone boundary crossing, Locnative POSTs `{event, zone, device, timestamp}` to the subscription URL with an `X-Locnative-Signature: hmac-sha256=...` header; verify the HMAC using the once-shown signing secret; 3 retries then the subscription is marked failing.

Match the existing prose component style in `docs-page.tsx`.

- [ ] **Step 4: Build + commit**

```bash
cd /Users/mac/Developer/projects/locnative.com/apps/web && pnpm build 2>&1 | tail -8
git -C /Users/mac/Developer/projects/locnative.com add apps/web/src/components/docs-page.tsx
git -C /Users/mac/Developer/projects/locnative.com commit -m "docs(web): document 16 new endpoints + async-lifecycle narrative on docs page"
```

---

## Task 3: Explorer catalog — GET executable, others docs-only

**Files:** Modify `apps/web/src/lib/api-explorer-endpoints.ts`

- [ ] **Step 1:** Add a catalog entry for each of the 16 endpoints, matching the existing entry shape. For the GET endpoints (geocode, batch poll, batch results, zones list/get/contains/addresses, devices zones, webhooks list) mark them executable (whatever flag the existing GET entries use). For POST/PUT/DELETE entries, set them as documentation-only (the try-it proxy is GET-only by design) — follow whatever convention the file supports; if there is no "docs-only" flag, include them with their method and a note, but DO NOT wire them to the GET-only `sendRequest` proxy (i.e. they appear in the catalog/docs but are not executable). Report exactly how you represented non-GET endpoints.

- [ ] **Step 2: Build + commit**

```bash
cd /Users/mac/Developer/projects/locnative.com/apps/web && pnpm build 2>&1 | tail -8
git -C /Users/mac/Developer/projects/locnative.com add apps/web/src/lib/api-explorer-endpoints.ts
git -C /Users/mac/Developer/projects/locnative.com commit -m "docs(web): add 16 new endpoints to API explorer catalog (GET executable)"
```

---

## Done — Phase 5 complete

End state: the in-app docs page and API explorer list all 16 new public endpoints with params, curl/JS examples, and example responses; GET endpoints are runnable in the try-it explorer; POST/PUT/DELETE are documented with curl; the OpenAPI JSON served at `/api/openapi.json` includes them; and the batch + webhook async lifecycles are explained.

No migration, no deploy dependency beyond the standard web app deploy. Independent of Phases 2/3 (no shared files), so it merges cleanly in any order.
