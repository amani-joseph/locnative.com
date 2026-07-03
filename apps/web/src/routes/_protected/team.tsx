import { Avatar, AvatarFallback } from "@locnative/ui/components/avatar";
import { Badge } from "@locnative/ui/components/badge";
import { Button } from "@locnative/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@locnative/ui/components/dialog";
import { Input } from "@locnative/ui/components/input";
import { Label } from "@locnative/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@locnative/ui/components/select";
import { Skeleton } from "@locnative/ui/components/skeleton";
import { createFileRoute } from "@tanstack/react-router";
import { MailIcon, ShieldIcon, UserPlusIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/lib/auth-client";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/_protected/team")({
	component: RouteComponent,
});

type TeamList = Awaited<ReturnType<typeof orpcClient.teams.listMine>>;
type TeamEntry = TeamList[number];

const INITIALS_SPLIT_RE = /[\s@.]+/;

function initialsOf(nameOrEmail: string): string {
	return nameOrEmail
		.split(INITIALS_SPLIT_RE)
		.filter(Boolean)
		.map((part) => part[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

function roleBadgeVariant(role: string): "default" | "secondary" | "outline" {
	if (role === "owner" || role === "admin") {
		return "default";
	}
	if (role === "member") {
		return "secondary";
	}
	return "outline";
}

function InviteDialog({
	teamId,
	onDone,
}: {
	teamId: string;
	onDone: () => void;
}) {
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<"member" | "admin">("member");
	const [submitting, setSubmitting] = useState(false);

	const submit = async () => {
		setSubmitting(true);
		try {
			await orpcClient.teams.invite({ teamId, email: email.trim(), role });
			toast.success(`Invitation sent to ${email.trim()}`);
			setEmail("");
			setRole("member");
			setOpen(false);
			onDone();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Could not send invitation"
			);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger
				render={
					<Button size="sm">
						<UserPlusIcon className="size-4" />
						Invite member
					</Button>
				}
			/>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Invite a team member</DialogTitle>
					<DialogDescription>
						They'll get an email with a link to join. The invite expires in 72
						hours.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="invite-email">Email</Label>
						<Input
							id="invite-email"
							onChange={(e) => setEmail(e.target.value)}
							placeholder="teammate@example.com"
							type="email"
							value={email}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="invite-role">Role</Label>
						<Select
							onValueChange={(v) => setRole(v as "member" | "admin")}
							value={role}
						>
							<SelectTrigger id="invite-role">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="member">Member</SelectItem>
								<SelectItem value="admin">Admin</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>
				<DialogFooter>
					<Button
						disabled={submitting || email.trim().length === 0}
						onClick={submit}
					>
						{submitting ? "Sending…" : "Send invite"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function CreateTeamDialog({ onDone }: { onDone: () => void }) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const submit = async () => {
		setSubmitting(true);
		try {
			await orpcClient.teams.create({ name: name.trim() });
			toast.success(`Created ${name.trim()}`);
			setName("");
			setOpen(false);
			onDone();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not create team");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger render={<Button variant="outline">Create team</Button>} />
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create a team</DialogTitle>
					<DialogDescription>
						Teams let you share projects and API keys with others.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-2">
					<Label htmlFor="team-name">Team name</Label>
					<Input
						id="team-name"
						onChange={(e) => setName(e.target.value)}
						placeholder="Acme Inc."
						value={name}
					/>
				</div>
				<DialogFooter>
					<Button
						disabled={submitting || name.trim().length === 0}
						onClick={submit}
					>
						{submitting ? "Creating…" : "Create team"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function RenameTeamDialog({
	teamId,
	currentName,
	onDone,
}: {
	teamId: string;
	currentName: string;
	onDone: () => void;
}) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState(currentName);
	const [submitting, setSubmitting] = useState(false);

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		if (next) {
			setName(currentName);
		}
	};

	const submit = async () => {
		setSubmitting(true);
		try {
			await orpcClient.teams.rename({ teamId, name: name.trim() });
			toast.success("Team renamed");
			setOpen(false);
			onDone();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not rename team");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogTrigger
				render={
					<Button size="sm" variant="outline">
						Rename
					</Button>
				}
			/>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Rename team</DialogTitle>
					<DialogDescription>
						Update the display name for this team.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-2">
					<Label htmlFor="rename-team-name">Team name</Label>
					<Input
						id="rename-team-name"
						onChange={(e) => setName(e.target.value)}
						placeholder="Acme Inc."
						value={name}
					/>
				</div>
				<DialogFooter>
					<Button
						disabled={
							submitting ||
							name.trim().length === 0 ||
							name.trim() === currentName
						}
						onClick={submit}
					>
						{submitting ? "Saving…" : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function DeleteTeamDialog({
	teamId,
	teamName,
	onDone,
}: {
	teamId: string;
	teamName: string;
	onDone: () => void;
}) {
	const [open, setOpen] = useState(false);
	const [submitting, setSubmitting] = useState(false);

	const submit = async () => {
		setSubmitting(true);
		try {
			await orpcClient.teams.delete({ teamId });
			toast.success(`Deleted ${teamName}`);
			setOpen(false);
			onDone();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not delete team");
			// Keep dialog open so the user sees the error reason (e.g. team still owns projects)
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger
				render={
					<Button size="sm" variant="ghost">
						Delete
					</Button>
				}
			/>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Delete team</DialogTitle>
					<DialogDescription>
						This action is permanent and cannot be undone. All members will lose
						access. The team must have no projects before it can be deleted.
					</DialogDescription>
				</DialogHeader>
				<p className="text-sm">
					Are you sure you want to delete{" "}
					<span className="font-medium">{teamName}</span>?
				</p>
				<DialogFooter>
					<Button
						disabled={submitting}
						onClick={() => setOpen(false)}
						variant="outline"
					>
						Cancel
					</Button>
					<Button disabled={submitting} onClick={submit} variant="destructive">
						{submitting ? "Deleting…" : "Delete team"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function LeaveTeamDialog({
	teamId,
	teamName,
	onDone,
}: {
	teamId: string;
	teamName: string;
	onDone: () => void;
}) {
	const [open, setOpen] = useState(false);
	const [submitting, setSubmitting] = useState(false);

	const submit = async () => {
		setSubmitting(true);
		try {
			await orpcClient.teams.leave({ teamId });
			toast.success(`Left ${teamName}`);
			setOpen(false);
			onDone();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not leave team");
			// Keep dialog open so the user sees why (e.g. last owner)
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger
				render={
					<Button size="sm" variant="ghost">
						Leave
					</Button>
				}
			/>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Leave team</DialogTitle>
					<DialogDescription>
						You will lose access to this team's projects and API keys. If you
						are the last owner, you must transfer ownership before leaving.
					</DialogDescription>
				</DialogHeader>
				<p className="text-sm">
					Are you sure you want to leave{" "}
					<span className="font-medium">{teamName}</span>?
				</p>
				<DialogFooter>
					<Button
						disabled={submitting}
						onClick={() => setOpen(false)}
						variant="outline"
					>
						Cancel
					</Button>
					<Button disabled={submitting} onClick={submit} variant="destructive">
						{submitting ? "Leaving…" : "Leave team"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function TeamSection({
	entry,
	currentUserId,
	onChanged,
}: {
	entry: TeamEntry;
	currentUserId: string | undefined;
	onChanged: () => void;
}) {
	const canManage = entry.myRole === "owner" || entry.myRole === "admin";
	const isOwner = entry.myRole === "owner";

	const removeMember = async (userId: string) => {
		try {
			await orpcClient.teams.removeMember({ teamId: entry.team.id, userId });
			toast.success("Member removed");
			onChanged();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Could not remove member"
			);
		}
	};

	const revokeInvite = async (invitationId: string) => {
		try {
			await orpcClient.teams.revokeInvite({ invitationId });
			toast.success("Invitation revoked");
			onChanged();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Could not revoke invite"
			);
		}
	};

	const resendInvite = async (invitationId: string) => {
		try {
			await orpcClient.teams.resendInvite({ invitationId });
			toast.success("Invitation resent");
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Could not resend invite"
			);
		}
	};

	const changeRole = async (
		userId: string,
		role: "owner" | "admin" | "member"
	) => {
		try {
			await orpcClient.teams.changeRole({
				teamId: entry.team.id,
				userId,
				role,
			});
			toast.success("Role updated");
			onChanged();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not update role");
		}
	};

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<CardTitle className="flex items-center gap-2">
							<ShieldIcon className="size-5" />
							{entry.team.name}
						</CardTitle>
						<CardDescription>
							{entry.members.length} member
							{entry.members.length === 1 ? "" : "s"} · you are {entry.myRole}
						</CardDescription>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						{canManage && (
							<RenameTeamDialog
								currentName={entry.team.name}
								onDone={onChanged}
								teamId={entry.team.id}
							/>
						)}
						{isOwner && (
							<DeleteTeamDialog
								onDone={onChanged}
								teamId={entry.team.id}
								teamName={entry.team.name}
							/>
						)}
						<LeaveTeamDialog
							onDone={onChanged}
							teamId={entry.team.id}
							teamName={entry.team.name}
						/>
						{canManage && (
							<InviteDialog onDone={onChanged} teamId={entry.team.id} />
						)}
					</div>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				<div className="divide-y">
					{entry.members.map((member) => {
						const display = member.name ?? member.email;
						const isSelf = member.userId === currentUserId;
						return (
							<div
								className="flex items-center justify-between py-3 first:pt-0"
								key={member.userId}
							>
								<div className="flex items-center gap-3">
									<Avatar className="size-9">
										<AvatarFallback className="text-xs">
											{initialsOf(display)}
										</AvatarFallback>
									</Avatar>
									<div>
										<p className="font-medium text-sm">
											{display}
											{isSelf && (
												<span className="ml-1.5 text-muted-foreground text-xs">
													(you)
												</span>
											)}
										</p>
										<p className="text-muted-foreground text-xs">
											{member.email}
										</p>
									</div>
								</div>
								<div className="flex items-center gap-3">
									<Badge variant={roleBadgeVariant(member.role)}>
										{member.role}
									</Badge>
									{canManage && !isSelf && (
										<Select
											onValueChange={(v) =>
												changeRole(
													member.userId,
													v as "owner" | "admin" | "member"
												)
											}
											value={member.role}
										>
											<SelectTrigger className="h-8 w-28 text-xs">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{isOwner && (
													<SelectItem value="owner">Owner</SelectItem>
												)}
												<SelectItem value="admin">Admin</SelectItem>
												<SelectItem value="member">Member</SelectItem>
											</SelectContent>
										</Select>
									)}
									{canManage && !isSelf && (
										<Button
											onClick={() => removeMember(member.userId)}
											size="sm"
											variant="ghost"
										>
											Remove
										</Button>
									)}
								</div>
							</div>
						);
					})}
				</div>

				{entry.pendingInvites.length > 0 && (
					<div className="flex flex-col gap-2">
						<p className="flex items-center gap-2 font-medium text-sm">
							<MailIcon className="size-4" />
							Pending invitations
						</p>
						{entry.pendingInvites.map((invite) => (
							<div
								className="flex items-center justify-between rounded-md border px-4 py-3"
								key={invite.id}
							>
								<div>
									<p className="font-medium text-sm">{invite.email}</p>
									<p className="text-muted-foreground text-xs">
										Invited as {invite.role}
									</p>
								</div>
								{canManage && (
									<div className="flex gap-2">
										<Button
											onClick={() => resendInvite(invite.id)}
											size="sm"
											variant="outline"
										>
											Resend
										</Button>
										<Button
											onClick={() => revokeInvite(invite.id)}
											size="sm"
											variant="ghost"
										>
											Revoke
										</Button>
									</div>
								)}
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function RouteComponent() {
	const { data: session } = useSession();
	const [teams, setTeams] = useState<TeamList>([]);
	const [loading, setLoading] = useState(true);

	const load = useCallback(async () => {
		try {
			const result = await orpcClient.teams.listMine();
			setTeams(result);
		} catch {
			toast.error("Could not load your teams");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load().catch(() => undefined);
	}, [load]);

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-center justify-between gap-4">
				<div>
					<h1 className="font-semibold text-2xl tracking-tight">Teams</h1>
					<p className="text-muted-foreground text-sm">
						Manage your teams, members, and invitations
					</p>
				</div>
				<CreateTeamDialog onDone={load} />
			</div>

			{loading ? (
				<div className="flex flex-col gap-3">
					<Skeleton className="h-40 w-full" />
					<Skeleton className="h-40 w-full" />
				</div>
			) : (
				teams.map((entry) => (
					<TeamSection
						currentUserId={session?.user?.id}
						entry={entry}
						key={entry.team.id}
						onChanged={load}
					/>
				))
			)}
		</div>
	);
}
