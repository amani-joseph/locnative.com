import { Badge } from "@locnative/ui/components/badge";
import { Button } from "@locnative/ui/components/button";
import { Skeleton } from "@locnative/ui/components/skeleton";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
	listSessions,
	revokeOtherSessions,
	revokeSession,
	useSession,
} from "@/lib/auth-client";
import { parseUserAgent } from "@/lib/security/ua.ts";

/**
 * better-auth's stock session type already includes id/token/userAgent/
 * ipAddress/updatedAt, but not the geoCity/geoRegion/geoCountry columns
 * added to the sessions table in Task 1 — those aren't reflected in the
 * generated client type. This narrow cast bridges that gap.
 */
interface SessionRow {
	geoCity?: string | null;
	geoCountry?: string | null;
	geoRegion?: string | null;
	id: string;
	ipAddress?: string | null;
	token: string;
	updatedAt: string | Date;
	userAgent?: string | null;
}

function locationLabel(s: SessionRow): string {
	const parts = [s.geoCity, s.geoRegion, s.geoCountry].filter(Boolean);
	return parts.length > 0 ? parts.join(", ") : "Unknown location";
}

function lastActive(value: string | Date): string {
	const d = typeof value === "string" ? new Date(value) : value;
	return d.toLocaleString();
}

export function ActiveSessionsCard() {
	const { data: current } = useSession();
	const currentToken = current?.session?.token;
	const [sessions, setSessions] = useState<SessionRow[] | null>(null);
	const [busy, setBusy] = useState(false);

	const load = useCallback(async () => {
		try {
			const result = await listSessions();
			if (result.error || !result.data) {
				setSessions([]);
				return;
			}
			setSessions(result.data as unknown as SessionRow[]);
		} catch {
			setSessions([]);
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const revokeOne = async (token: string) => {
		const previous = sessions;
		setSessions((s) => s?.filter((row) => row.token !== token) ?? null);
		const result = await revokeSession({ token });
		if (result.error) {
			setSessions(previous ?? null);
			toast.error("Could not revoke session.");
			return;
		}
		toast.success("Session revoked.");
		load();
	};

	const revokeOthers = async () => {
		setBusy(true);
		const result = await revokeOtherSessions();
		setBusy(false);
		if (result.error) {
			toast.error("Could not sign out other devices.");
			return;
		}
		toast.success("Signed out of all other devices.");
		load();
	};

	if (sessions === null) {
		return (
			<div className="space-y-2">
				<Skeleton className="h-12 w-full" />
				<Skeleton className="h-12 w-full" />
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<div>
					<p className="font-medium text-sm">Active Sessions</p>
					<p className="text-muted-foreground text-xs">
						Devices where you&apos;re signed in
					</p>
				</div>
				<Button
					disabled={busy || sessions.length <= 1}
					onClick={revokeOthers}
					size="sm"
					variant="outline"
				>
					Sign out other devices
				</Button>
			</div>

			{sessions.length === 0 ? (
				<p className="text-muted-foreground text-sm">No active sessions.</p>
			) : (
				<ul className="divide-y rounded-md border">
					{sessions.map((s) => {
						const ua = parseUserAgent(s.userAgent);
						const isCurrent = s.token === currentToken;
						return (
							<li
								className="flex items-center justify-between gap-3 p-3"
								key={s.id}
							>
								<div className="min-w-0">
									<div className="flex items-center gap-2">
										<p className="truncate font-medium text-sm">
											{ua.browser} · {ua.os}
										</p>
										{isCurrent && <Badge>This device</Badge>}
									</div>
									<p className="truncate text-muted-foreground text-xs">
										{ua.device} · {s.ipAddress ?? "Unknown IP"} ·{" "}
										{locationLabel(s)}
									</p>
									<p className="text-muted-foreground text-xs">
										Last active {lastActive(s.updatedAt)}
									</p>
								</div>
								{!isCurrent && (
									<Button
										onClick={() => revokeOne(s.token)}
										size="sm"
										variant="ghost"
									>
										Revoke
									</Button>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
