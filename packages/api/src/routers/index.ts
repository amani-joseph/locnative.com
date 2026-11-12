import { apiExplorerRouter } from "./domains/api-explorer.ts";
import { apiKeysRouter } from "./domains/api-keys.ts";
import { authRouter } from "./domains/auth.ts";
import { billingRouter } from "./domains/billing.ts";
import { dashboardRouter } from "./domains/dashboard.ts";
import { geocodeRouter } from "./domains/geocode.ts";
import { onboardingRouter } from "./domains/onboarding.ts";
import { projectsRouter } from "./domains/projects.ts";
import { teamsRouter } from "./domains/teams.ts";
import { webhooksRouter } from "./domains/webhooks.ts";
import { zonesRouter } from "./domains/zones.ts";

export const appRouter = {
	apiExplorer: apiExplorerRouter,
	apiKeys: apiKeysRouter,
	auth: authRouter,
	billing: billingRouter,
	dashboard: dashboardRouter,
	geocode: geocodeRouter,
	onboarding: onboardingRouter,
	projects: projectsRouter,
	teams: teamsRouter,
	zones: zonesRouter,
	webhooks: webhooksRouter,
};

export type AppRouter = typeof appRouter;
