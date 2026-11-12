"use client";

import { PasswordInput } from "@locnative/ui/components/password-input";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { resetPassword } from "@/lib/auth-client";

const MIN_PASSWORD_LENGTH = 8;

interface ResetPasswordProps {
	token?: string;
}

const ResetPassword = ({ token }: ResetPasswordProps) => {
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const navigate = useNavigate();

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setErrorMessage(null);

		if (!token) {
			setErrorMessage("This reset link is invalid or has expired.");
			return;
		}

		const formData = new FormData(event.currentTarget);
		const newPassword = String(formData.get("password") ?? "");
		const confirmPassword = String(formData.get("confirmPassword") ?? "");

		if (newPassword.length < MIN_PASSWORD_LENGTH) {
			setErrorMessage(
				`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
			);
			return;
		}

		if (newPassword !== confirmPassword) {
			setErrorMessage("Passwords don't match.");
			return;
		}

		setIsSubmitting(true);

		try {
			const { error } = await resetPassword({ newPassword, token });

			if (error) {
				setErrorMessage(
					error.message ??
						"Unable to reset password. The link may have expired."
				);
				return;
			}

			await navigate({ to: "/sign-in" });
		} catch {
			setErrorMessage("Unable to reset password right now. Please try again.");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<AuthFrame title="Set a new password.">
			{token ? (
				<form className="w-full space-y-6" onSubmit={handleSubmit}>
					<div className="space-y-4">
						<div className="space-y-1.5">
							<Label
								className="font-normal text-muted-foreground text-sm"
								htmlFor="password"
							>
								New password*
							</Label>
							<PasswordInput
								autoComplete="new-password"
								className="h-9 rounded-md border-border bg-background text-foreground shadow-xs dark:bg-background"
								disabled={isSubmitting}
								id="password"
								name="password"
								placeholder="Enter a new password"
								required
							/>
						</div>
						<div className="space-y-1.5">
							<Label
								className="font-normal text-muted-foreground text-sm"
								htmlFor="confirmPassword"
							>
								Confirm password*
							</Label>
							<PasswordInput
								autoComplete="new-password"
								className="h-9 rounded-md border-border bg-background text-foreground shadow-xs dark:bg-background"
								disabled={isSubmitting}
								id="confirmPassword"
								name="confirmPassword"
								placeholder="Re-enter your new password"
								required
							/>
						</div>
					</div>

					{errorMessage ? (
						<p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
							{errorMessage}
						</p>
					) : null}

					<Button
						className="h-10 w-full cursor-pointer rounded-lg hover:bg-primary/80"
						disabled={isSubmitting}
						type="submit"
					>
						{isSubmitting ? "Resetting..." : "Reset password"}
					</Button>
				</form>
			) : (
				<div className="flex flex-col gap-4">
					<p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
						This reset link is invalid or has expired. Request a new one to
						continue.
					</p>
					<Link
						className="inline-flex h-10 items-center justify-center rounded-lg font-medium text-sm transition-all hover:bg-muted"
						to="/forgot-password"
					>
						Request a new link
					</Link>
				</div>
			)}
		</AuthFrame>
	);
};

export default ResetPassword;
