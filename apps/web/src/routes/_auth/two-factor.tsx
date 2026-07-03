import { Button } from "@locnative/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import { Input } from "@locnative/ui/components/input";
import { Label } from "@locnative/ui/components/label";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
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
		<div className="mx-auto flex min-h-svh w-full max-w-sm items-center px-4">
			<Card className="w-full">
				<CardHeader>
					<CardTitle>Two-factor authentication</CardTitle>
					<CardDescription>
						{useBackup
							? "Enter one of your backup codes."
							: "Enter the 6-digit code from your authenticator app."}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form className="space-y-4" onSubmit={submit}>
						<div className="space-y-2">
							<Label htmlFor="code">
								{useBackup ? "Backup code" : "Authentication code"}
							</Label>
							<Input
								autoComplete="one-time-code"
								autoFocus
								id="code"
								inputMode={useBackup ? "text" : "numeric"}
								onChange={(e) => setCode(e.target.value)}
								placeholder={useBackup ? "XXXXX-XXXXX" : "123456"}
								value={code}
							/>
						</div>
						{!useBackup && (
							<label className="flex items-center gap-2 text-muted-foreground text-sm">
								<input
									checked={trustDevice}
									onChange={(e) => setTrustDevice(e.target.checked)}
									type="checkbox"
								/>
								Trust this device for 30 days
							</label>
						)}
						<Button className="w-full" disabled={loading} type="submit">
							{loading ? "Verifying…" : "Verify"}
						</Button>
						<Button
							className="w-full"
							onClick={() => {
								setUseBackup((v) => !v);
								setCode("");
							}}
							type="button"
							variant="ghost"
						>
							{useBackup ? "Use authenticator app" : "Use a backup code"}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
