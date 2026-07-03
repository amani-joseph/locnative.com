import { Button } from "@locnative/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import { Skeleton } from "@locnative/ui/components/skeleton";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { signOut, useSession } from "@/lib/auth-client";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/invite/$id")({
	component: RouteComponent,
});

type Invite = Awaited<ReturnType<typeof orpcClient.teams.getInvite>>;

function RouteComponent() {
	const { id } = Route.useParams();
	const navigate = useNavigate();
	const { data: session, isPending: sessionPending } = useSession();
	const [invite, setInvite] = useState<Invite>(null);
	const [loading, setLoading] = useState(true);
	const [accepting, setAccepting] = useState(false);

	const load = useCallback(async () => {
		try {
			const result = await orpcClient.teams.getInvite({ invitationId: id });
			setInvite(result);
		} catch {
			setInvite(null);
		} finally {
			setLoading(false);
		}
	}, [id]);

	useEffect(() => {
		load().catch(() => undefined);
	}, [load]);

	const accept = async () => {
		setAccepting(true);
		try {
			await orpcClient.teams.acceptInvite({ invitationId: id });
			toast.success("You've joined the team");
			await navigate({ to: "/team" });
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Could not accept invitation"
			);
		} finally {
			setAccepting(false);
		}
	};

	if (loading || sessionPending) {
		return (
			<div className="mx-auto max-w-md p-6">
				<Skeleton className="h-48 w-full" />
			</div>
		);
	}

	if (!invite || invite.status !== "pending" || invite.expired) {
		let reason = "This invitation could not be found.";
		if (invite) {
			if (invite.expired) {
				reason = "This invitation has expired.";
			} else if (invite.status === "accepted") {
				reason = "This invitation has already been accepted.";
			} else {
				reason = "This invitation is no longer active.";
			}
		}
		return (
			<InviteShell description={reason} title="Invitation unavailable">
				<Button render={<Link to="/team">Go to your teams</Link>} />
			</InviteShell>
		);
	}

	const sessionEmail = session?.user?.email;
	const emailMatches =
		sessionEmail?.toLowerCase() === invite.invitedEmail.toLowerCase();

	if (!session) {
		return (
			<InviteShell
				description={`You've been invited to join ${invite.teamName} as ${invite.role}. Sign in as ${invite.invitedEmail} to accept.`}
				title={`Join ${invite.teamName}`}
			>
				<Button render={<Link to="/sign-in">Sign in to accept</Link>} />
			</InviteShell>
		);
	}

	if (!emailMatches) {
		return (
			<InviteShell
				description={`This invitation is for ${invite.invitedEmail}, but you're signed in as ${sessionEmail}. Sign out and sign in with the invited address.`}
				title="Wrong account"
			>
				<Button onClick={() => signOut()} variant="outline">
					Sign out
				</Button>
			</InviteShell>
		);
	}

	return (
		<InviteShell
			description={`You've been invited to join ${invite.teamName} as ${invite.role}.`}
			title={`Join ${invite.teamName}`}
		>
			<Button disabled={accepting} onClick={accept}>
				{accepting ? "Joining…" : `Join ${invite.teamName}`}
			</Button>
		</InviteShell>
	);
}

function InviteShell({
	title,
	description,
	children,
}: {
	title: string;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<div className="mx-auto flex min-h-svh max-w-md items-center p-6">
			<Card className="w-full">
				<CardHeader>
					<CardTitle>{title}</CardTitle>
					<CardDescription>{description}</CardDescription>
				</CardHeader>
				<CardContent>{children}</CardContent>
			</Card>
		</div>
	);
}
