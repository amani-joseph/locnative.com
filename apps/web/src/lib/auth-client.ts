import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const getAuthBaseUrl = (): string => {
	// Local dev: point at the local server.
	if (
		typeof window !== "undefined" &&
		window.location.hostname === "localhost"
	) {
		return "http://localhost:3003";
	}

	// Production: point at the API server. Cross-subdomain cookies on
	// .locnative.com share session between web and API.
	return (
		import.meta.env.VITE_SERVER_URL ??
		process.env.BETTER_AUTH_URL ??
		"https://api.locnative.com"
	);
};

export const authClient = createAuthClient({
	baseURL: getAuthBaseUrl(),
	fetchOptions: {
		credentials: "include",
	},
	plugins: [
		twoFactorClient({
			onTwoFactorRedirect() {
				if (typeof window !== "undefined") {
					window.location.href = "/two-factor";
				}
			},
		}),
	],
});

export const {
	useSession,
	signIn,
	signUp,
	signOut,
	requestPasswordReset,
	resetPassword,
	twoFactor,
	listSessions,
	revokeSession,
	revokeSessions,
	revokeOtherSessions,
	deleteUser,
} = authClient;
