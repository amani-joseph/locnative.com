# Country Coverage Expansion — Dataset Options for Review

_Researched 2026-06-23. Sources: Overture Maps addresses guide (release `2026-06-17.0`), OpenAddresses, and national open-data portals (links at bottom)._

## How to read this

Locnative already ingests addresses via three adapters: `overture` (most of Europe),
`nad` (US), and `oda` (Canada). G-NAF supplies Australia. **The cheapest expansion is any
country already in the Overture addresses theme that we haven't loaded yet** — it needs only
a new entry in `scripts/intl/lib/source-registry.ts` + run-queue, *no new loader code*.

### Currently covered (~28)

AU, US, CA + Overture: AT, BE, CH, CZ, DE, DK, EE, ES, FI, FO, FR, HR, IS, IT, LI, LT, LU,
LV, NL, NO, PL, PT, RS, SI, SK.

---

## Tier 1 — Drop-in wins (already in Overture, zero new loader) ⭐

These are in Overture `2026-06-17.0` but **not yet loaded**. Same `overture` adapter, same
pipeline. Counts are Overture's own address totals. Recommend ordering by impact.

| Country | ISO | Overture addresses | Notes / effort |
|---|---|---:|---|
| **Brazil** | BR | 89.9M | Huge. AddressForAll-sourced. Single admin level. ~Neon cost is the only real gate. |
| **Mexico** | MX | 30.7M | Huge LATAM win. |
| **Japan** | JP | 19.6M | Major market. Overture is romaji/partial; see Tier 2 for authoritative upgrade. |
| **Taiwan** | TW | 9.7M | |
| **Colombia** | CO | 7.8M | |
| **Chile** | CL | 4.2M | |
| **New Zealand** | NZ | 2.4M | Strong English-speaking market; LINZ upgrade available (Tier 2). |
| **Uruguay** | UY | 1.06M | |
| **Hong Kong** | HK | 177K | |
| **Singapore** | SG | 142K | OneMap upgrade available (Tier 2). |
| **Greenland** | GL | 20K | Tiny; bundle with Nordics if desired. |

**Combined Tier 1 ≈ 166M new addresses with essentially no new code.** Validate each with
the existing rollout checklist (state mapping, sample eyeball, GeoNames hit-rate, Neon cost).

---

## Tier 2 — Authoritative national datasets (new loader, higher quality)

Either fills a country Overture lacks, or upgrades a Tier-1 country to richer/authoritative
data (postcodes, units, stable IDs).

| Country | ISO | Dataset | License | In Overture? | Verdict |
|---|---|---|---|---|---|
| **United Kingdom** | GB | OS OpenData (Code-Point Open, OpenNames) + OSM house numbers | OGL / ODbL | ❌ No | **Biggest gap.** Plan already drafted: `docs/proposals/uk-address-data-plan.md`. New loader. |
| **Sweden** | SE | Lantmäteriet Belägenhetsadresser (open geodata) | **CC0** | ❌ No | Real gap + fully open + authoritative. Strong candidate. |
| **Japan** | JP | Digital Agency Address Base Registry (アドレス・ベース・レジストリ) | Govt Std Terms v2.0 (attribution) | ✅ (weaker) | Authoritative CSV/JSONL. Upgrade over Overture if JP is a priority market. |
| **New Zealand** | NZ | LINZ NZ Street Address | **CC-BY 4.0** | ✅ (weaker) | Authoritative, richer than Overture. Easy LDS download. Upgrade. |
| **Singapore** | SG | OneMap (SLA) | Free gov API/data | ✅ (weaker) | Authoritative national geocoder; richer than Overture's 142K. |

---

## Tier 3 — OSM-only / sparse (lower priority)

Countries with no open national address release; OSM is the only free source, so coverage is
partial and inconsistent. Candidates if demand appears: **Ireland (IE)** (Eircode/GeoDirectory
are commercial), **Greece (GR)**, **Hungary (HU)**, **Romania (RO)**, **Bulgaria (BG)**,
**Ukraine (UA)**, **South Africa (ZA)**, **India (IN)**. Recommend: skip until a customer asks.

---

## Recommended next step

Pick a subset of **Tier 1** (suggest: NZ, JP, BR, MX as the highest-value markets) and run them
through the existing `overture` pipeline. Hold a Neon CU/cost check before BR + MX (the two big
ones). Treat GB and SE as the only Tier-2 items worth a dedicated loader near-term.

## Sources

- [Overture addresses guide (per-country counts)](https://docs.overturemaps.org/guides/addresses/)
- [Overture 2026-06-17 release notes](https://docs.overturemaps.org/blog/2026/06/17/release-notes/)
- [OpenAddresses coverage](https://results.openaddresses.io/coverage/world/)
- [LINZ Data Service (NZ)](https://data.linz.govt.nz/)
- [Japan Address Base Registry (Digital Agency)](https://www.digital.go.jp/en/policies/base_registry_address) · [dataset portal](https://dataset.address-br.digital.go.jp/)
- [Singapore OneMap API](https://www.onemap.gov.sg/apidocs/)
- [Sweden Lantmäteriet open data (CC0)](https://www.lantmateriet.se/en/geodata/our-products/open-data/)
- [UK OS OpenData](https://osdatahub.os.uk/downloads/open)
