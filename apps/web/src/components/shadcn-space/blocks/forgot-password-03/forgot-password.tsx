"use client";

import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/lib/auth-client";

const ForgotPassword = () => {
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isSent, setIsSent] = useState(false);
	const navigate = useNavigate();

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setErrorMessage(null);
		setIsSubmitting(true);

		const formData = new FormData(event.currentTarget);
		const email = String(formData.get("email") ?? "").trim();

		try {
			const { error } = await requestPasswordReset({
				email,
				redirectTo: "/reset-password",
			});

			if (error) {
				setErrorMessage(
					error.message ?? "Unable to send reset email. Please try again."
				);
				return;
			}

			// Always show success — don't reveal whether the email exists.
			setIsSent(true);
		} catch {
			setErrorMessage(
				"Unable to send reset email right now. Please try again."
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<AuthFrame title="Forgot your password?">
			{isSent ? (
				<div className="flex flex-col gap-4">
					<p className="rounded-lg border border-border bg-muted/40 px-3 py-3 text-foreground text-sm">
						If an account exists for that email, we&apos;ve sent a link to reset
						your password. Check your inbox.
					</p>
					<Button
						className="h-10 cursor-pointer rounded-lg dark:hover:bg-muted"
						onClick={() => navigate({ to: "/sign-in" })}
						type="button"
						variant="ghost"
					>
						Back to Login
					</Button>
				</div>
			) : (
				<form className="w-full space-y-6" onSubmit={handleSubmit}>
					<div className="space-y-4">
						<div className="space-y-1.5">
							<Label
								className="font-normal text-muted-foreground text-sm"
								htmlFor="email"
							>
								Email*
							</Label>
							<Input
								autoComplete="email"
								className="h-9"
								disabled={isSubmitting}
								id="email"
								name="email"
								placeholder="you@locnative.com"
								required
								type="email"
							/>
						</div>
					</div>

					{errorMessage ? (
						<p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
							{errorMessage}
						</p>
					) : null}

					<div className="flex flex-col gap-3">
						<Button
							className="h-10 cursor-pointer rounded-lg hover:bg-primary/80"
							disabled={isSubmitting}
							type="submit"
						>
							{isSubmitting ? "Sending..." : "Send reset link"}
						</Button>
						<Link
							className="inline-flex h-10 items-center justify-center rounded-lg font-medium text-sm transition-all hover:bg-muted"
							to="/sign-in"
						>
							Back to Login
						</Link>
					</div>
				</form>
			)}
		</AuthFrame>
	);
};

export default ForgotPassword;
