import { Button } from "@locnative/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@locnative/ui/components/dialog";
import { Input } from "@locnative/ui/components/input";
import { Label } from "@locnative/ui/components/label";
import { useState } from "react";
import { toast } from "sonner";
import { deleteUser, twoFactor, useSession } from "@/lib/auth-client";
import { validateDeleteConfirmation } from "@/lib/security/delete-confirmation.ts";

export function DeleteAccountCard() {
	const { data: session } = useSession();
	const email = session?.user?.email ?? null;
	const twoFactorEnabled = Boolean(session?.user?.twoFactorEnabled);

	const [open, setOpen] = useState(false);
	const [acknowledged, setAcknowledged] = useState(false);
	const [typedEmail, setTypedEmail] = useState("");
	const [password, setPassword] = useState("");
	const [totpCode, setTotpCode] = useState("");
	const [loading, setLoading] = useState(false);

	const { valid, errors } = validateDeleteConfirmation({
		typedEmail,
		accountEmail: email,
		password,
		twoFactorEnabled,
		totpCode,
	});

	const reset = () => {
		setAcknowledged(false);
		setTypedEmail("");
		setPassword("");
		setTotpCode("");
	};

	const confirmDelete = async () => {
		setLoading(true);
		// When 2FA is on, verify the TOTP code first so deletion is gated on it.
		if (twoFactorEnabled) {
			const verify = await twoFactor.verifyTotp({ code: totpCode.trim() });
			if (verify.error) {
				setLoading(false);
				toast.error("Invalid 2FA code.");
				return;
			}
		}
		const result = await deleteUser({ password, callbackURL: "/" });
		setLoading(false);
		if (result.error) {
			toast.error(result.error.message ?? "Could not delete account.");
			return;
		}
		toast.success("Account deleted.");
		window.location.href = "/";
	};

	return (
		<div className="flex items-center justify-between">
			<div>
				<p className="font-medium text-destructive text-sm">Delete Account</p>
				<p className="text-muted-foreground text-xs">
					Permanently delete your account and all data
				</p>
			</div>
			<Button
				onClick={() => {
					reset();
					setOpen(true);
				}}
				size="sm"
				variant="destructive"
			>
				Delete
			</Button>

			<Dialog onOpenChange={(o) => setOpen(o)} open={open}>
				<DialogContent>
					{acknowledged ? (
						<>
							<DialogHeader>
								<DialogTitle>Confirm account deletion</DialogTitle>
								<DialogDescription>
									Type your email and re-enter your password to continue.
								</DialogDescription>
							</DialogHeader>
							<div className="space-y-3">
								<div className="space-y-2">
									<Label htmlFor="del-email">
										Type your email ({email}) to confirm
									</Label>
									<Input
										autoComplete="off"
										id="del-email"
										onChange={(e) => setTypedEmail(e.target.value)}
										value={typedEmail}
									/>
									{typedEmail && errors.email && (
										<p className="text-destructive text-xs">{errors.email}</p>
									)}
								</div>
								<div className="space-y-2">
									<Label htmlFor="del-pw">Password</Label>
									<Input
										id="del-pw"
										onChange={(e) => setPassword(e.target.value)}
										type="password"
										value={password}
									/>
								</div>
								{twoFactorEnabled && (
									<div className="space-y-2">
										<Label htmlFor="del-totp">Authentication code</Label>
										<Input
											id="del-totp"
											inputMode="numeric"
											onChange={(e) => setTotpCode(e.target.value)}
											placeholder="123456"
											value={totpCode}
										/>
									</div>
								)}
							</div>
							<DialogFooter>
								<Button onClick={() => setOpen(false)} variant="outline">
									Cancel
								</Button>
								<Button
									disabled={!valid || loading}
									onClick={confirmDelete}
									variant="destructive"
								>
									{loading ? "Deleting…" : "Permanently delete"}
								</Button>
							</DialogFooter>
						</>
					) : (
						<>
							<DialogHeader>
								<DialogTitle>Delete your account?</DialogTitle>
								<DialogDescription>
									This action is permanent and cannot be undone.
								</DialogDescription>
							</DialogHeader>
							<div className="space-y-3 text-sm">
								<div>
									<p className="font-medium">This will permanently delete:</p>
									<ul className="list-disc pl-5 text-muted-foreground">
										<li>Your account and profile</li>
										<li>All projects and API keys</li>
										<li>All active sessions and 2FA settings</li>
										<li>Team memberships you own</li>
									</ul>
								</div>
								<div>
									<p className="font-medium">Retained for legal/compliance:</p>
									<ul className="list-disc pl-5 text-muted-foreground">
										<li>Billing and invoice records</li>
										<li>Security audit logs (anonymized)</li>
									</ul>
								</div>
							</div>
							<DialogFooter>
								<Button onClick={() => setOpen(false)} variant="outline">
									Cancel
								</Button>
								<Button
									onClick={() => setAcknowledged(true)}
									variant="destructive"
								>
									I understand, continue
								</Button>
							</DialogFooter>
						</>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}
