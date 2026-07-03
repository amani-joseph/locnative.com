"use client";

import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ShaderAnimation } from "@/components/shadcn-space/animations/shader-lines";
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
							Forgot your password?
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
								{isSent ? (
									<div className="flex flex-col gap-4">
										<p className="rounded-lg border border-border bg-muted/40 px-3 py-3 text-foreground text-sm">
											If an account exists for that email, we&apos;ve sent a
											link to reset your password. Check your inbox.
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

export default ForgotPassword;
