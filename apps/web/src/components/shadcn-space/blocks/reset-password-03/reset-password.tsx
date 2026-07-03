"use client";

import { PasswordInput } from "@locnative/ui/components/password-input";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ShaderAnimation } from "@/components/shadcn-space/animations/shader-lines";
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
		<section className="flex min-h-screen flex-col overflow-hidden bg-background font-sans selection:bg-primary selection:text-primary-foreground">
			<div className="flex flex-1 flex-col">
				{/* Top Spacer Line */}
				<div className="mx-auto w-full max-w-7xl flex-1 border-border border-x" />

				{/* Header Row */}
				<div className="relative mx-auto w-full max-w-7xl border-border border-x border-b before:absolute before:right-full before:-bottom-px before:h-px before:w-screen before:bg-border after:absolute after:-bottom-px after:left-full after:h-px after:w-screen after:bg-border">
					<div className="flex flex-col gap-4 px-8 py-16">
						<div className="flex items-center gap-1.5">
							<span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
							<p className="font-normal text-base text-muted-foreground">
								Welcome to Locnative
							</p>
						</div>
						<p className="font-semibold text-5xl text-foreground md:text-6xl lg:text-7xl">
							Set a new password.
						</p>
					</div>
				</div>

				{/* Content Grid Row */}
				<div className="relative mx-auto w-full max-w-7xl border-border border-x border-b before:absolute before:right-full before:-bottom-px before:h-px before:w-screen before:bg-border after:absolute after:-bottom-px after:left-full after:h-px after:w-screen after:bg-border">
					<div className="relative grid grid-cols-1 overflow-hidden md:grid-cols-12">
						{/* LEFT SIDE: Image Area (col-span-7) */}
						<div className="relative hidden overflow-hidden md:col-span-7 md:block">
							<ShaderAnimation />
						</div>

						{/* RIGHT SIDE: Form Area (col-span-5) */}
						<div className="flex flex-col justify-center px-8 py-10 md:col-span-5">
							<div className="mx-auto flex w-full max-w-sm flex-col gap-4">
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
											This reset link is invalid or has expired. Request a new
											one to continue.
										</p>
										<Link
											className="inline-flex h-10 items-center justify-center rounded-lg font-medium text-sm transition-all hover:bg-muted"
											to="/forgot-password"
										>
											Request a new link
										</Link>
									</div>
								)}
							</div>
						</div>
					</div>
				</div>

				{/* Bottom Spacer Row */}
				<div className="mx-auto w-full max-w-7xl flex-1 border-border border-x py-16" />
			</div>
		</section>
	);
};

export default ResetPassword;
