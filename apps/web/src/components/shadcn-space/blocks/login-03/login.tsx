"use client";

import { Icon } from "@iconify/react";
import { Checkbox } from "@locnative/ui/components/checkbox";
import { Label } from "@locnative/ui/components/label";
import { PasswordInput } from "@locnative/ui/components/password-input";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth-client";

const LoginForm = () => {
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [rememberMe, setRememberMe] = useState(true);
	const [socialProvider, setSocialProvider] = useState<"github" | null>(null);
	const router = useRouter();
	const navigate = useNavigate();

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setErrorMessage(null);
		setIsSubmitting(true);

		const formData = new FormData(event.currentTarget);
		const email = String(formData.get("email") ?? "").trim();
		const password = String(formData.get("password") ?? "");

		try {
			const { error } = await signIn.email({
				email,
				password,
				rememberMe,
			});

			if (error) {
				setErrorMessage(
					error.message ?? "Unable to sign in. Please try again."
				);
				return;
			}

			// Sign-in succeeded — refresh auth state and redirect
			await router.invalidate();
			await navigate({ to: "/dashboard" });
			return;
		} catch {
			setErrorMessage("Unable to sign in right now. Please try again.");
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleSocialSignIn = async (provider: "github") => {
		setErrorMessage(null);
		setSocialProvider(provider);

		try {
			const { error } = await signIn.social({
				callbackURL: `${window.location.origin}/dashboard`,
				provider,
			});

			if (error) {
				setErrorMessage(
					error.message ??
						`Unable to continue with ${provider}. Please try again.`
				);
				setSocialProvider(null);
			}
		} catch {
			setErrorMessage(`Unable to continue with ${provider}. Please try again.`);
			setSocialProvider(null);
		}
	};

	return (
		<AuthFrame title="Sign In.">
			<form className="space-y-6" onSubmit={handleSubmit}>
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
							className="h-9 rounded-md border-border bg-background text-foreground shadow-xs dark:bg-background"
							disabled={isSubmitting || socialProvider !== null}
							id="email"
							name="email"
							placeholder="you@locnative.com"
							required
							type="email"
						/>
					</div>
					<div className="space-y-1.5">
						<Label
							className="font-normal text-muted-foreground text-sm"
							htmlFor="password"
						>
							Password*
						</Label>
						<PasswordInput
							autoComplete="current-password"
							className="h-9 rounded-md border-border bg-background text-foreground shadow-xs dark:bg-background"
							disabled={isSubmitting || socialProvider !== null}
							id="password"
							name="password"
							placeholder="Enter your password"
							required
						/>
					</div>
					<div className="flex flex-wrap items-center justify-between gap-4 text-sm">
						<div className="flex items-center space-x-3">
							<Checkbox
								checked={rememberMe}
								className="cursor-pointer border-border data-checked:bg-primary data-checked:text-primary-foreground dark:bg-background"
								id="remember"
								onCheckedChange={(checked) => setRememberMe(checked === true)}
							/>
							<Label
								className="cursor-pointer font-normal text-muted-foreground leading-none"
								htmlFor="remember"
							>
								Remember this device
							</Label>
						</div>
						<Link
							className="font-medium text-foreground text-sm underline-offset-4 transition-all hover:underline"
							to="/forgot-password"
						>
							Forgot Password?
						</Link>
					</div>
				</div>

				{errorMessage ? (
					<p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
						{errorMessage}
					</p>
				) : null}

				<Button
					className="h-10 w-full cursor-pointer rounded-lg transition-all hover:bg-primary/80"
					disabled={isSubmitting || socialProvider !== null}
					size="lg"
					type="submit"
				>
					{isSubmitting ? "Signing in..." : "Sign in"}
				</Button>
			</form>

			<div className="flex items-center gap-3 font-normal text-muted-foreground text-sm before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
				or
			</div>

			<Button
				className="h-9 cursor-pointer gap-3 rounded-lg font-semibold shadow-xs hover:cursor-pointer dark:bg-background"
				disabled={isSubmitting || socialProvider !== null}
				onClick={() => handleSocialSignIn("github")}
				type="button"
				variant="outline"
			>
				<Icon className="h-4 w-4 text-foreground" icon="simple-icons:github" />
				{socialProvider === "github"
					? "Redirecting to GitHub..."
					: "Sign in with GitHub"}
			</Button>

			<p className="text-center font-normal text-muted-foreground text-sm">
				Don&apos;t have an account?{" "}
				<Link
					className="font-medium text-foreground underline-offset-4 transition-all hover:underline"
					to="/sign-up"
				>
					Create an account
				</Link>
			</p>
		</AuthFrame>
	);
};

export default LoginForm;
