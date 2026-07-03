import {
	autocompleteAddresses,
	formatAddress,
} from "@locnative/database/queries";
import { addresses } from "@locnative/database/schema";
import { ORPCError } from "@orpc/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { o as baseBuilder } from "../builder.ts";
import { getDeviceZones, pushDeviceLocation } from "./public/devices.ts";
import {
	batchGeocodePoll,
	batchGeocodeResults,
	batchGeocodeSubmit,
	forwardGeocode,
} from "./public/geocode.ts";
import { regionsClassify } from "./public/regions.ts";
import {
	routingDirections,
	routingIsochrone,
	routingMatch,
	routingMatrix,
	routingOptimize,
} from "./public/routing.ts";
import {
	createWebhook,
	deleteWebhook,
	listWebhooks,
	reactivateWebhookEndpoint,
} from "./public/webhooks.ts";
import {
	zoneAddresses,
	zoneContains,
	zoneCreate,
	zoneDelete,
	zoneGet,
	zoneList,
	zoneUpdate,
} from "./public/zones.ts";
import { apiKeyAuth, usageMiddleware } from "./public-middleware.ts";

// ---------------------------------------------------------------------------
// Procedures
// ---------------------------------------------------------------------------

const autocomplete = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("addresses.autocomplete"))
	.route({
		method: "GET",
		path: "/api/v1/addresses/autocomplete",
		summary: "Autocomplete address search",
		tags: ["addresses"],
	})
	.input(
		z
			.object({
				q: z
					.string()
					.min(2, "Query parameter 'q' must be at least 2 characters."),
				country: z.string().optional(),
				state: z.string().optional(),
				limit: z.coerce.number().int().min(1).max(20).default(10),
				lat: z.coerce.number().min(-90).max(90).optional(),
				lon: z.coerce.number().min(-180).max(180).optional(),
			})
			.refine((data) => (data.lat === undefined) === (data.lon === undefined), {
				message: "Both 'lat' and 'lon' must be provided together.",
			})
	)
	.handler(async ({ input, context }) => {
		const { results, parsedQuery } = await autocompleteAddresses(
			context.db,
			input.q,
			{
				country: input.country,
				state: input.state,
				limit: input.limit,
				latitude: input.lat,
				longitude: input.lon,
			}
		);
		// Map explicitly: the autocomplete contract exposes streetAddress (the
		// combined line), not the individual street components that the shared
		// AutocompleteResult now also carries for the forward-geocode response.
		return {
			results: results.map((r) => ({
				id: r.id,
				formattedAddress: r.formattedAddress,
				streetAddress: r.streetAddress,
				locality: r.locality,
				state: r.state,
				postcode: r.postcode,
				country: r.country,
				latitude: r.latitude,
				longitude: r.longitude,
			})),
			count: results.length,
			parsedQuery,
		};
	});

const nearby = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("addresses.nearby"))
	.route({
		method: "GET",
		path: "/api/v1/addresses/nearby",
		summary: "Find addresses near a point",
		tags: ["addresses"],
	})
	.input(
		z.object({
			lat: z.coerce.number().min(-90).max(90),
			lng: z.coerce.number().min(-180).max(180),
			radius: z.coerce.number().min(1).max(50_000).default(1000),
			limit: z.coerce.number().int().min(1).max(50).default(10),
			country: z.string().optional(),
		})
	)
	.handler(async ({ input, context }) => {
		const { lat, lng, radius, limit, country } = input;
		const point = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
		const geomGeo = sql`${addresses.geom}::geography`;

		const filters = [sql`ST_DWithin(${geomGeo}, ${point}, ${radius})`];
		if (country) {
			filters.push(sql`${addresses.country} = ${country.toUpperCase()}`);
		}

		const rows = await context.db
			.select({
				id: addresses.id,
				country: addresses.country,
				state: addresses.state,
				locality: addresses.locality,
				postcode: addresses.postcode,
				streetName: addresses.streetName,
				streetType: addresses.streetType,
				numberFirst: addresses.numberFirst,
				numberLast: addresses.numberLast,
				buildingName: addresses.buildingName,
				flatType: addresses.flatType,
				flatNumber: addresses.flatNumber,
				longitude: addresses.longitude,
				latitude: addresses.latitude,
				distance: sql<number>`ST_Distance(${geomGeo}, ${point})`.as("distance"),
			})
			.from(addresses)
			.where(and(...filters))
			// KNN ordering via the `<->` operator walks the geography GiST index
			// nearest-first and stops at `limit`, instead of sorting every address
			// inside the radius (which is tens of thousands of rows in dense areas
			// like a CBD). `distance` above still reports accurate spheroidal
			// ST_Distance; only the ordering uses the index-assisted operator.
			.orderBy(sql`${geomGeo} <-> ${point}`)
			.limit(limit);

		return {
			results: rows.map((row) => ({
				...row,
				distance: Math.round(row.distance),
			})),
			count: rows.length,
			query: { lat, lng, radius },
		};
	});

const reverse = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("addresses.reverse"))
	.route({
		method: "GET",
		path: "/api/v1/addresses/reverse",
		summary: "Reverse geocode coordinates to an address",
		tags: ["addresses"],
	})
	.input(
		z.object({
			lat: z.coerce.number().min(-90).max(90),
			lng: z.coerce.number().min(-180).max(180),
		})
	)
	.handler(async ({ input, context }) => {
		const { lat, lng } = input;
		const point = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
		const geomGeo = sql`${addresses.geom}::geography`;

		const rows = await context.db
			.select({
				id: addresses.id,
				country: addresses.country,
				state: addresses.state,
				locality: addresses.locality,
				postcode: addresses.postcode,
				streetName: addresses.streetName,
				streetType: addresses.streetType,
				streetSuffix: addresses.streetSuffix,
				numberFirst: addresses.numberFirst,
				numberLast: addresses.numberLast,
				buildingName: addresses.buildingName,
				flatType: addresses.flatType,
				flatNumber: addresses.flatNumber,
				levelType: addresses.levelType,
				levelNumber: addresses.levelNumber,
				longitude: addresses.longitude,
				latitude: addresses.latitude,
				confidence: addresses.confidence,
				gnafPid: addresses.gnafPid,
				distance: sql<number>`ST_Distance(${geomGeo}, ${point})`.as("distance"),
			})
			.from(addresses)
			.where(sql`ST_DWithin(${geomGeo}, ${point}, 200)`)
			// KNN ordering via `<->` uses the geography GiST index to fetch the
			// single nearest address directly (see addresses.nearby above).
			.orderBy(sql`${geomGeo} <-> ${point}`)
			.limit(1);

		if (rows.length === 0) {
			throw new ORPCError("NOT_FOUND", {
				message: "No address found within 200m of the given coordinates.",
			});
		}

		// biome-ignore lint: length check above guarantees existence
		const row = rows[0]!;
		const numberRange = row.numberLast
			? `${row.numberFirst}-${row.numberLast}`
			: row.numberFirst;
		const streetParts = [
			numberRange,
			row.streetName,
			row.streetType,
			row.streetSuffix,
		].filter(Boolean);

		return {
			address: {
				id: row.id,
				formattedAddress: formatAddress(streetParts.join(" "), {
					locality: row.locality,
					state: row.state,
					postcode: row.postcode,
					country: row.country,
				}),
				streetAddress: streetParts.join(" "),
				locality: row.locality,
				state: row.state,
				postcode: row.postcode,
				country: row.country,
				longitude: row.longitude,
				latitude: row.latitude,
				confidence: row.confidence,
			},
			distance: Math.round(row.distance),
			query: { lat, lng },
		};
	});

const byId = baseBuilder
	.use(apiKeyAuth)
	.use(usageMiddleware("addresses.byId"))
	.route({
		method: "GET",
		path: "/api/v1/addresses/{id}",
		summary: "Get address by ID",
		tags: ["addresses"],
	})
	.input(
		z.object({
			id: z.coerce.number().int().min(1),
		})
	)
	.handler(async ({ input, context }) => {
		const rows = await context.db
			.select()
			.from(addresses)
			.where(eq(addresses.id, input.id))
			.limit(1);

		if (rows.length === 0) {
			throw new ORPCError("NOT_FOUND", { message: "Address not found." });
		}

		// biome-ignore lint: length check above guarantees existence
		const row = rows[0]!;
		return {
			id: row.id,
			country: row.country,
			state: row.state,
			locality: row.locality,
			postcode: row.postcode,
			streetName: row.streetName,
			streetType: row.streetType,
			streetSuffix: row.streetSuffix,
			buildingName: row.buildingName,
			flatType: row.flatType,
			flatNumber: row.flatNumber,
			levelType: row.levelType,
			levelNumber: row.levelNumber,
			numberFirst: row.numberFirst,
			numberLast: row.numberLast,
			longitude: row.longitude,
			latitude: row.latitude,
			confidence: row.confidence,
			gnafPid: row.gnafPid,
		};
	});

// ---------------------------------------------------------------------------
// Router (separate from appRouter — only used by OpenAPIHandler)
// ---------------------------------------------------------------------------

export const publicHttpRouter = {
	addresses: {
		autocomplete,
		nearby,
		reverse,
		byId,
	},
	geocode: forwardGeocode,
	batchGeocodeSubmit,
	batchGeocodePoll,
	batchGeocodeResults,
	zones: {
		zoneCreate,
		zoneList,
		zoneGet,
		zoneUpdate,
		zoneDelete,
		zoneContains,
		zoneAddresses,
	},
	regions: {
		classify: regionsClassify,
	},
	routing: {
		directions: routingDirections,
		matrix: routingMatrix,
		isochrone: routingIsochrone,
		match: routingMatch,
		optimize: routingOptimize,
	},
	devices: {
		deviceLocation: pushDeviceLocation,
		deviceZones: getDeviceZones,
	},
	webhooks: {
		webhookCreate: createWebhook,
		webhookList: listWebhooks,
		webhookDelete: deleteWebhook,
		webhookReactivate: reactivateWebhookEndpoint,
	},
};

export type PublicHttpRouter = typeof publicHttpRouter;
