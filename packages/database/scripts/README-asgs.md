# ASGS boundary ingestion

Loads ABS ASGS Edition 3 (2021) administrative boundaries into the `regions` table.

## Prerequisites
- GDAL (`ogr2ogr`, `ogrinfo`) and `psql` installed locally.
- `DATABASE_URL` set to the target Postgres (PostGIS enabled).

## Data sources (CC-BY 4.0, attribute to the ABS)
Download the GeoPackage for each layer from the ABS ASGS Edition 3 downloads
page (https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3)
and place the `.gpkg` files under `packages/database/scripts/data/asgs/`:

| layer | file |
|-------|------|
| state | STE_2021_AUST_GDA2020.gpkg |
| sa1   | SA1_2021_AUST_GDA2020.gpkg |
| sa2   | SA2_2021_AUST_GDA2020.gpkg |
| sa3   | SA3_2021_AUST_GDA2020.gpkg |
| sa4   | SA4_2021_AUST_GDA2020.gpkg |
| lga   | LGA_2021_AUST_GDA2020.gpkg |
| poa   | POA_2021_AUST_GDA2020.gpkg |
| ced   | CED_2021_AUST_GDA2020.gpkg |
| sed   | SED_2021_AUST_GDA2020.gpkg |
| mb    | MB_2021_AUST_GDA2020.gpkg  |

> Verify field and layer names before ingesting: `ogrinfo -so <file.gpkg>`. The
> script's `-sql` reads the layer as the filename stem (e.g. `STE_2021_AUST_GDA2020`)
> and selects the `*_CODE21` / `*_NAME21` columns. If a downloaded GeoPackage uses
> a different internal layer name or field names, update `LAYERS` in `ingest-asgs.ts`.

## Run
Light subset (fast, good for local dev):

    DATABASE_URL=... pnpm --filter @locnative/database exec tsx scripts/ingest-asgs.ts state sa4 lga poa

Full ingest (mb + sa1 are large, ~430k polygons total):

    DATABASE_URL=... pnpm --filter @locnative/database exec tsx scripts/ingest-asgs.ts

Re-running a layer is safe — each layer is deleted before reload.

## Verify after ingest

    psql "$DATABASE_URL" -c "SELECT layer, count(*) FROM regions GROUP BY layer ORDER BY layer;"
    psql "$DATABASE_URL" -c "SELECT layer, code, name FROM regions WHERE ST_Covers(geom, ST_SetSRID(ST_MakePoint(144.9631, -37.8136), 4326));"

The second query should return Victoria + the Melbourne LGA + postcode 3000 for the central-Melbourne coordinate.
