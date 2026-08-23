import { createRequester } from "./http.ts";
import {
	type AddressesResource,
	createAddresses,
} from "./resources/addresses.ts";
import { createDevices, type DevicesResource } from "./resources/devices.ts";
import { createGeocode, type GeocodeResource } from "./resources/geocode.ts";
import { createRegions, type RegionsResource } from "./resources/regions.ts";
import { createRouting, type RoutingResource } from "./resources/routing.ts";
import { createWebhooks, type WebhooksResource } from "./resources/webhooks.ts";
import { createZones, type ZonesResource } from "./resources/zones.ts";
import type { LocnativeClientConfig } from "./shared-types.ts";

export interface LocnativeClient {
	addresses: AddressesResource;
	devices: DevicesResource;
	geocode: GeocodeResource;
	regions: RegionsResource;
	routing: RoutingResource;
	webhooks: WebhooksResource;
	zones: ZonesResource;
}

export const createLocnativeClient = (
	config: LocnativeClientConfig
): LocnativeClient => {
	const request = createRequester(config);
	return {
		addresses: createAddresses(request),
		geocode: createGeocode(request),
		zones: createZones(request),
		devices: createDevices(request),
		webhooks: createWebhooks(request),
		regions: createRegions(request),
		routing: createRouting(request),
	};
};
