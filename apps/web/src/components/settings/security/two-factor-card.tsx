import { Badge } from "@locnative/ui/components/badge";
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
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { twoFactor, useSession } from "@/lib/auth-client";
import {
	backupCodesFilename,
	formatBackupCodes,
} from "@/lib/security/backup-codes.ts";
import { extractTotpSecret } from "@/lib/security/totp-uri.ts";

type Step = "password" | "scan" | "verify" | "backup";

function downloadBackupCodes(
	codes: string[],
	email: string | null | undefined
) {
	const blob = new Blob([formatBackupCodes(codes)], { type: "text/plain" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = backupCodesFilename(email);
	a.click();
	URL.revokeObjectURL(url);
}

export function TwoFactorCard() {
	const { data: session } = useSession();
	const enabled = Boolean(session?.user?.twoFactorEnabled);
	const email = session?.user?.email ?? null;

	const [open, setOpen] = useState(false);
	const [step, setStep] = useState<Step>("password");
	const [password, setPassword] = useState("");
	const [totpUri, setTotpUri] = useState("");
	const [qrDataUrl, setQrDataUrl] = useState("");
	const [code, setCode] = useState("");
	const [backupCodes, setBackupCodes] = useState<string[]>([]);
	const [loading, setLoading] = useState(false);
	const [disableOpen, setDisableOpen] = useState(false);

	useEffect(() => {
		if (!totpUri) {
			return;
		}
		QRCode.toDataURL(totpUri, { width: 200 })
			.then(setQrDataUrl)
			.catch(() => setQrDataUrl(""));
	}, [totpUri]);

	const reset = () => {
		setStep("password");
		setPassword("");
		setTotpUri("");
		setQrDataUrl("");
		setCode("");
		setBackupCodes([]);
	};

	const startEnable = async () => {
		setLoading(true);
		const result = await twoFactor.enable({ password });
		setLoading(false);
		if (result.error || !result.data) {
			toast.error(result.error?.message ?? "Could not start 2FA setup.");
			return;
		}
		setTotpUri(result.data.totpURI);
		setBackupCodes(result.data.backupCodes);
		setStep("scan");
	};

	const verifyEnable = async () => {
		setLoading(true);
		const result = await twoFactor.verifyTotp({ code: code.trim() });
		setLoading(false);
		if (result.error) {
			toast.error(result.error.message ?? "Invalid code. Try again.");
			return;
		}
		setStep("backup");
		toast.success("Two-factor authentication enabled.");
	};

	const disable = async (pw: string) => {
		setLoading(true);
		const result = await twoFactor.disable({ password: pw });
		setLoading(false);
		if (result.error) {
			toast.error(result.error.message ?? "Could not disable 2FA.");
			return;
		}
		setDisableOpen(false);
		toast.success("Two-factor authentication disabled.");
	};

	const regenerate = async (pw: string) => {
		setLoading(true);
		const result = await twoFactor.generateBackupCodes({ password: pw });
		setLoading(false);
		if (result.error || !result.data) {
			toast.error(result.error?.message ?? "Could not regenerate codes.");
			return;
		}
		setBackupCodes(result.data.backupCodes);
		setStep("backup");
		setDisableOpen(false);
		setOpen(true);
		toast.success("New backup codes generated. Old codes no longer work.");
	};

	const manualKey = totpUri ? extractTotpSecret(totpUri) : null;

	return (
		<div className="flex items-center justify-between">
			<div>
				<div className="flex items-center gap-2">
					<p className="font-medium text-sm">Two-Factor Authentication</p>
					<Badge variant={enabled ? "default" : "outline"}>
						{enabled ? "Enabled" : "Disabled"}
					</Badge>
				</div>
				<p className="text-muted-foreground text-xs">
					Add an extra layer of security to your account
				</p>
			</div>

			{enabled ? (
				<Button
					onClick={() => setDisableOpen(true)}
					size="sm"
					variant="outline"
				>
					Manage
				</Button>
			) : (
				<Button
					onClick={() => {
						reset();
						setOpen(true);
					}}
					size="sm"
					variant="outline"
				>
					Enable
				</Button>
			)}

			{/* Enable / backup-codes dialog */}
			<Dialog onOpenChange={(o) => setOpen(o)} open={open}>
				<DialogContent>
					{step === "password" && (
						<>
							<DialogHeader>
								<DialogTitle>Enable two-factor authentication</DialogTitle>
								<DialogDescription>
									Confirm your password to begin setup.
								</DialogDescription>
							</DialogHeader>
							<div className="space-y-2">
								<Label htmlFor="tf-pw">Password</Label>
								<Input
									id="tf-pw"
									onChange={(e) => setPassword(e.target.value)}
									type="password"
									value={password}
								/>
							</div>
							<DialogFooter>
								<Button disabled={!password || loading} onClick={startEnable}>
									Continue
								</Button>
							</DialogFooter>
						</>
					)}

					{step === "scan" && (
						<>
							<DialogHeader>
								<DialogTitle>Scan the QR code</DialogTitle>
								<DialogDescription>
									Scan with Google Authenticator, 1Password, Authy, or Microsoft
									Authenticator. Then enter the 6-digit code.
								</DialogDescription>
							</DialogHeader>
							<div className="flex flex-col items-center gap-3">
								{qrDataUrl ? (
									<img
										alt="2FA QR code"
										height={200}
										src={qrDataUrl}
										width={200}
									/>
								) : (
									<p className="text-muted-foreground text-sm">Generating…</p>
								)}
								{manualKey && (
									<p className="break-all text-center text-muted-foreground text-xs">
										Manual key: <span className="font-mono">{manualKey}</span>
									</p>
								)}
							</div>
							<DialogFooter>
								<Button onClick={() => setStep("verify")}>Next</Button>
							</DialogFooter>
						</>
					)}

					{step === "verify" && (
						<>
							<DialogHeader>
								<DialogTitle>Verify your code</DialogTitle>
								<DialogDescription>
									Enter the current 6-digit code to finish enabling 2FA.
								</DialogDescription>
							</DialogHeader>
							<div className="space-y-2">
								<Label htmlFor="tf-code">Authentication code</Label>
								<Input
									id="tf-code"
									inputMode="numeric"
									onChange={(e) => setCode(e.target.value)}
									placeholder="123456"
									value={code}
								/>
							</div>
							<DialogFooter>
								<Button
									disabled={code.trim().length < 6 || loading}
									onClick={verifyEnable}
								>
									Verify &amp; enable
								</Button>
							</DialogFooter>
						</>
					)}

					{step === "backup" && (
						<>
							<DialogHeader>
								<DialogTitle>Save your backup codes</DialogTitle>
								<DialogDescription>
									Store these somewhere safe. Each code works once and they
									won&apos;t be shown again.
								</DialogDescription>
							</DialogHeader>
							<ul className="grid grid-cols-2 gap-1 rounded-md bg-muted p-3 font-mono text-sm">
								{backupCodes.map((c) => (
									<li key={c}>{c}</li>
								))}
							</ul>
							<DialogFooter>
								<Button
									onClick={() => downloadBackupCodes(backupCodes, email)}
									variant="outline"
								>
									Download
								</Button>
								<Button onClick={() => setOpen(false)}>Done</Button>
							</DialogFooter>
						</>
					)}
				</DialogContent>
			</Dialog>

			{/* Manage (disable / regenerate) dialog */}
			<ManageDialog
				key={disableOpen ? "open" : "closed"}
				loading={loading}
				onDisable={disable}
				onOpenChange={(o) => setDisableOpen(o)}
				onRegenerate={regenerate}
				open={disableOpen}
			/>
		</div>
	);
}

function ManageDialog({
	open,
	onOpenChange,
	onDisable,
	onRegenerate,
	loading,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	onDisable: (password: string) => void;
	onRegenerate: (password: string) => void;
	loading: boolean;
}) {
	const [password, setPassword] = useState("");
	return (
		<Dialog onOpenChange={(o) => onOpenChange(o)} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Manage two-factor authentication</DialogTitle>
					<DialogDescription>
						Confirm your password to disable 2FA or generate new backup codes.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-2">
					<Label htmlFor="tf-manage-pw">Password</Label>
					<Input
						id="tf-manage-pw"
						onChange={(e) => setPassword(e.target.value)}
						type="password"
						value={password}
					/>
				</div>
				<DialogFooter>
					<Button
						disabled={!password || loading}
						onClick={() => onRegenerate(password)}
						variant="outline"
					>
						Regenerate backup codes
					</Button>
					<Button
						disabled={!password || loading}
						onClick={() => onDisable(password)}
						variant="destructive"
					>
						Disable 2FA
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
