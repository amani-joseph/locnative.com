# Production API latency benchmark — 2026-09-07

## Summary

The production API was benchmarked after deployment of Worker version
`d40ec38d-2697-40c1-9c96-dcbeaebf2314` and the dense-postcode index fix.

- Target: `https://api.locnative.com`
- Client location: Brisbane, Australia
- Protocol: HTTPS with API-key authentication
- Execution: sequential requests using Node.js `fetch`
- Samples: one excluded warm-up followed by 20 measured requests per scenario
- Total measured requests: 320
- Measurement: end-to-end client wall time, including network and response-body download
- Concurrency: one request at a time, so this is a latency benchmark rather than a load test

## Results

All durations are milliseconds, rounded to the nearest millisecond.

| Scenario | Method | Endpoint | Samples | Status | Average | Median | P95 | Min | Max |
|---|---|---|---:|---|---:|---:|---:|---:|---:|
| Autocomplete — postcode (`2000`) | GET | `/api/v1/addresses/autocomplete` | 20 | 20× 200 | 110 | 93 | 162 | 86 | 368 |
| Autocomplete — locality (`bondi`) | GET | `/api/v1/addresses/autocomplete` | 20 | 20× 200 | 92 | 93 | 99 | 86 | 104 |
| Autocomplete — typo (`sydeny`) | GET | `/api/v1/addresses/autocomplete` | 20 | 20× 200 | 181 | 181 | 187 | 175 | 187 |
| Autocomplete — zero match (`zzzzzz`) | GET | `/api/v1/addresses/autocomplete` | 20 | 20× 200 | 187 | 180 | 216 | 175 | 239 |
| Forward geocode — freeform | GET | `/api/v1/addresses/geocode` | 20 | 20× 200 | 110 | 110 | 119 | 103 | 120 |
| Forward geocode — structured | GET | `/api/v1/addresses/geocode` | 20 | 20× 200 | 89 | 89 | 92 | 83 | 92 |
| Nearby addresses | GET | `/api/v1/addresses/nearby` | 20 | 20× 200 | 96 | 93 | 101 | 90 | 131 |
| Reverse geocode | GET | `/api/v1/addresses/reverse` | 20 | 20× 200 | 93 | 93 | 96 | 89 | 99 |
| Address by ID | GET | `/api/v1/addresses/4544247` | 20 | 20× 200 | 88 | 88 | 94 | 83 | 95 |
| Region classification | GET | `/api/v1/regions` | 20 | 20× 200 | 90 | 88 | 95 | 86 | 108 |
| List zones (empty project) | GET | `/api/v1/zones` | 20 | 20× 200 | 92 | 91 | 98 | 84 | 113 |
| Zones containing point (empty project) | GET | `/api/v1/zones/contains` | 20 | 20× 200 | 90 | 88 | 98 | 84 | 105 |
| List webhooks (empty project) | GET | `/api/v1/webhooks` | 20 | 20× 200 | 89 | 87 | 97 | 81 | 99 |
| Routing — directions (paused) | GET | `/api/v1/routing/directions` | 20 | 20× 503 | 79 | 70 | 86 | 66 | 213 |
| Routing — matrix (paused) | GET | `/api/v1/routing/matrix` | 20 | 20× 503 | 71 | 71 | 75 | 65 | 76 |
| Routing — isochrone (paused) | GET | `/api/v1/routing/isochrone` | 20 | 20× 503 | 71 | 70 | 75 | 65 | 80 |

## Interpretation

- The active successful endpoints had averages between 88 ms and 110 ms for
  exact/indexed lookups.
- Fuzzy typo and zero-result autocomplete took an additional indexed fallback
  stage, averaging 181–187 ms. Their narrow min/max and p95 ranges show that the
  previously unbounded no-match behavior is no longer present.
- Postcode autocomplete averaged 110 ms. One 368 ms outlier raised the average;
  its median was 93 ms and p95 was 162 ms.
- Every active scenario returned the expected HTTP 200 for all 20 samples.
- Routing currently exits through the intentional paused-service path. Its 503
  timings measure API validation/authentication and error delivery only; they do
  not measure OSRM routing latency.

## Endpoints not measured as successful operations

The following endpoints were excluded because a meaningful test would create,
update, enqueue, or delete persistent project data, or required an existing
resource not present in the benchmark project:

- `POST /api/v1/geocode/batch`
- `GET /api/v1/geocode/batch/{jobId}`
- `GET /api/v1/geocode/batch/{jobId}/results`
- `POST /api/v1/zones`
- `GET /api/v1/zones/{id}`
- `PUT /api/v1/zones/{id}`
- `DELETE /api/v1/zones/{id}`
- `GET /api/v1/zones/{id}/addresses`
- `POST /api/v1/devices/{deviceId}/location`
- `GET /api/v1/devices/{deviceId}/zones`
- `POST /api/v1/webhooks`
- `DELETE /api/v1/webhooks/{id}`
- `POST /api/v1/webhooks/{id}/reactivate`
- `POST /api/v1/routing/match`
- `POST /api/v1/routing/optimize`

These should be benchmarked with a dedicated disposable project and fixtures so
the test can clean up after itself and does not mix expected 404 responses with
successful-operation latency.

## Reproduction

Run from the repository root with a benchmark API key:

```bash
VITE_DEMO_API_KEY="..." node scripts/benchmark-production-api.mjs
```
