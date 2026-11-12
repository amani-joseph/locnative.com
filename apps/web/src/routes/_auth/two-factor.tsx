import { Button } from "@locnative/ui/components/button";
import { Checkbox } from "@locnative/ui/components/checkbox";
import { Input } from "@locnative/ui/components/input";
import { Label } from "@locnative/ui/components/label";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AuthFrame } from "@/components/auth-frame";
import { twoFactor } from "@/lib/auth-client";

const DASHBOARD_PATH = "/dashboard";

export const Route = createFileRoute("/_auth/two-factor")({
	component: TwoFactorRoute,
});

function TwoFactorRoute() {
	const navigate = useNavigate();
	const [code, setCode] = useState("");
	const [useBackup, setUseBackup] = useState(false);
	const [trustDevice, setTrustDevice] = useState(false);
	const [loading, setLoading] = useState(false);

	const submit = async (event: React.FormEvent) => {
		event.preventDefault();
		setLoading(true);
		const result = useBackup
			? await twoFactor.verifyBackupCode({ code: code.trim() })
			: await twoFactor.verifyTotp({ code: code.trim(), trustDevice });
		setLoading(false);
		if (result.error) {
			toast.error(result.error.message ?? "Invalid code. Try again.");
			return;
		}
		navigate({ to: DASHBOARD_PATH });
	};

	return (
		<AuthFrame title="Verify it's you.">
			<p className="text-muted-foreground text-sm">
				{useBackup
					? "Enter one of the backup codes you saved when you turned on two-factor authentication."
					: "Enter the 6-digit code from your authenticator app."}
			</p>
			<form className="space-y-6" onSubmit={submit}>
				<div className="space-y-1.5">
					<Label
						className="font-normal text-muted-foreground text-sm"
						htmlFor="code"
					>
						{useBackup ? "Backup code" : "Authentication code"}
					</Label>
					<Input
						autoComplete="one-time-code"
						autoFocus
						className="h-10 font-mono text-lg tracking-[0.3em]"
						id="code"
						inputMode={useBackup ? "text" : "numeric"}
						onChange={(e) => setCode(e.target.value)}
						placeholder={useBackup ? "XXXXX-XXXXX" : "123456"}
						value={code}
					/>
				</div>
				{useBackup ? null : (
					<div className="flex items-center gap-3 text-sm">
						<Checkbox
							checked={trustDevice}
							className="cursor-pointer border-border data-checked:bg-primary data-checked:text-primary-foreground dark:bg-background"
							id="trust-device"
							onCheckedChange={(checked) => setTrustDevice(checked === true)}
						/>
						<Label
							className="cursor-pointer font-normal text-muted-foreground leading-none"
							htmlFor="trust-device"
						>
							Trust this device for 30 days
						</Label>
					</div>
				)}
				<div className="flex flex-col gap-3">
					<Button
						className="h-10 w-full cursor-pointer rounded-lg"
						disabled={loading}
						type="submit"
					>
						{loading ? "Verifying…" : "Verify"}
					</Button>
					<Button
						className="h-10 w-full cursor-pointer rounded-lg"
						onClick={() => {
							setUseBackup((v) => !v);
							setCode("");
						}}
						type="button"
						variant="ghost"
					>
						{useBackup ? "Use authenticator app" : "Use a backup code"}
					</Button>
				</div>
			</form>
		</AuthFrame>
	);
}
