import { sql } from "drizzle-orm";
import {
	customType,
	index,
	integer,
	pgTable,
	real,
	text,
	varchar,
} from "drizzle-orm/pg-core";

const geometry = customType<{ data: string }>({
	dataType() {
		return "geometry(Point, 4326)";
	},
});

export const addresses = pgTable(
	"addresses",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		country: varchar({ length: 2 }).notNull(),
		// Nullable: single-level-addressing countries (Iceland, Belgium, etc.) have
		// no state/region. Existing rows may carry '' (legacy); both '' and NULL mean
		// "no state" and the read paths (autocomplete filter, structured rerank,
		// formatAddress) tolerate either. See docs/migrations/2026-06-20-state-nullable.
		state: varchar({ length: 10 }),
		locality: text().notNull(),
		postcode: varchar({ length: 10 }).notNull(),
		streetName: text("street_name").notNull(),
		streetType: varchar("street_type", { length: 20 }),
		streetSuffix: varchar("street_suffix", { length: 10 }),
		buildingName: text("building_name"),
		flatType: varchar("flat_type", { length: 10 }),
		flatNumber: varchar("flat_number", { length: 10 }),
		levelType: varchar("level_type", { length: 10 }),
		levelNumber: varchar("level_number", { length: 10 }),
		numberFirst: varchar("number_first", { length: 15 }),
		numberLast: varchar("number_last", { length: 15 }),
		longitude: real().notNull(),
		latitude: real().notNull(),
		confidence: integer(),
		gnafPid: varchar("gnaf_pid", { length: 30 }),
		searchText: text("search_text"),
		geom: geometry("geom"),
		populationScore: integer("population_score").notNull().default(0),
		adminLevel: integer("admin_level").notNull().default(5),
		// Provenance, set by coverage loaders (e.g. 'OS_CODEPOINT' / 'OS_OPENNAMES'
		// from scripts/intl/gb-coverage.ts). NULL for legacy / Overture / OSM rows.
		// Lets a source-scoped reload refresh OS coverage without touching the
		// OSM-derived GB rows. See docs/proposals/uk-address-data-plan.md.
		source: text("source"),
	},
	(table) => [
		index("idx_addresses_country").on(table.country),
		index("idx_addresses_state").on(table.country, table.state),
		index("idx_addresses_postcode").on(table.postcode),
		index("idx_addresses_locality").on(
			table.country,
			table.state,
			table.locality
		),
		index("idx_addresses_street").on(table.locality, table.streetName),
		// Suburb autocomplete: country as an equality prefix, locality as the
		// range key, state for the skip-scan's ordering. idx_addresses_locality
		// cannot serve this — its `state` column sits before `locality`, so a
		// locality range cannot be a scan key. See drizzle/0018.
		index("idx_addresses_country_locality").on(
			table.country,
			table.locality,
			table.state
		),
		// idx_addresses_gnaf_pid was dropped in drizzle/0019: 3 GB serving no
		// query. gnaf_pid is returned in API responses but never filtered on,
		// and the index recorded zero scans over the database's whole lifetime.
		// Re-add it if a lookup-by-gnaf_pid endpoint is ever introduced.
		index("idx_addresses_country_state_postcode").on(
			table.country,
			table.state,
			table.postcode
		),
		index("idx_addresses_geom").using("gist", table.geom),
		// Expression index on the geography cast. The proximity endpoints
		// (addresses.nearby / addresses.reverse) filter with
		// `ST_DWithin(geom::geography, point, meters)`; the plain geometry GiST
		// index above cannot serve that cast, which forced a full seq scan of
		// ~5.6M rows (~15-48s). This expression index brings those queries to
		// ~130-220ms.
		index("idx_addresses_geom_geography").using(
			"gist",
			sql`(${table.geom}::geography)`
		),
	]
);

export type Address = typeof addresses.$inferSelect;
export type NewAddress = typeof addresses.$inferInsert;
