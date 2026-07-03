import { useEffect, useRef } from "react";
import type { Component } from "vue";

/**
 * Mounts a Vue 3 component inside the React tree. Used to showcase the live
 * @locnative/vue-ui components on the dashboard's component library page.
 *
 * Why a bridge: the dashboard is a React/TanStack Start app with no Vue
 * renderer. We mount each Vue component into a plain DOM ref via `createApp`.
 *
 * Why everything Vue-related is dynamically imported inside the effect: the app
 * is server-rendered in workerd, and importing `vue` / the vue-ui bundle at
 * module-eval time risks crashing SSR (see the repo's history of browser-only
 * imports breaking SSR routes). `useEffect` only runs on the client, so Vue
 * never touches the server.
 */
export interface VueIslandProps {
	/** Class applied to the host element Vue mounts into. */
	className?: string;
	/** Lazily resolves the Vue component to mount (keep the reference stable). */
	load: () => Promise<Component>;
	/**
	 * Props passed to the Vue component. Vue maps `onXxx` keys to event
	 * listeners (e.g. `onSelect` → the `select` emit). Top-level changes are
	 * synced into the live app on every render.
	 */
	props: Record<string, unknown>;
}

export function VueIsland({ className, load, props }: VueIslandProps) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	// Holds the live Vue `shallowReactive` props object once mounted.
	const reactivePropsRef = useRef<Record<string, unknown> | null>(null);
	// Always-current props so the async mount uses the latest snapshot.
	const latestPropsRef = useRef(props);
	latestPropsRef.current = props;

	// Mount once per `load` identity (loaders are module-level constants).
	useEffect(() => {
		let unmount: (() => void) | null = null;
		let cancelled = false;

		(async () => {
			const [vue, component] = await Promise.all([import("vue"), load()]);
			if (cancelled || !hostRef.current) {
				return;
			}
			const reactiveProps = vue.shallowReactive({ ...latestPropsRef.current });
			reactivePropsRef.current = reactiveProps;
			const app = vue.createApp({
				render: () => vue.h(component, reactiveProps),
			});
			app.mount(hostRef.current);
			unmount = () => app.unmount();
		})();

		return () => {
			cancelled = true;
			unmount?.();
			reactivePropsRef.current = null;
		};
	}, [load]);

	// Sync prop changes into the mounted Vue app after every render (no deps
	// array on purpose — props identity changes each render).
	useEffect(() => {
		const reactiveProps = reactivePropsRef.current;
		if (!reactiveProps) {
			return;
		}
		for (const key of Object.keys(reactiveProps)) {
			if (!(key in props)) {
				delete reactiveProps[key];
			}
		}
		Object.assign(reactiveProps, props);
	});

	return <div className={className} ref={hostRef} />;
}
