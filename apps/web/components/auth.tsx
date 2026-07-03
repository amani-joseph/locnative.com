import { cn } from "@locnative/ui/lib/utils";
import { AtSignIcon } from "lucide-react";
import type React from "react";
import { AuthDivider } from "@/components/auth-divider";
import { Button } from "@/components/ui/button";
import { DecorIcon } from "@/components/ui/decor-icon";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group";

export function AuthPage() {
	return (
		<div className="relative flex h-screen w-full items-center justify-center overflow-hidden px-6 md:px-8">
			<div
				className={cn(
					"relative flex w-full max-w-sm flex-col justify-between p-6 md:p-8",
					"dark:bg-[radial-gradient(50%_80%_at_20%_0%,--theme(--color-foreground/.1),transparent)]"
				)}
			>
				<div className="absolute -inset-y-6 -left-px w-px bg-border" />
				<div className="absolute -inset-y-6 -right-px w-px bg-border" />
				<div className="absolute -inset-x-6 -top-px h-px bg-border" />
				<div className="absolute -inset-x-6 -bottom-px h-px bg-border" />
				<DecorIcon position="top-left" />
				<DecorIcon position="bottom-right" />

				<div className="w-full max-w-sm animate-in space-y-8">
					<div className="flex flex-col space-y-1">
						<h1 className="font-bold text-2xl tracking-wide">Join Now!</h1>
						<p className="text-base text-muted-foreground">
							Login or create your efferd account.
						</p>
					</div>
					<div className="space-y-4">
						<form className="space-y-2">
							<InputGroup>
								<InputGroupInput
									placeholder="your.email@example.com"
									type="email"
								/>
								<InputGroupAddon align="inline-start">
									<AtSignIcon />
								</InputGroupAddon>
							</InputGroup>

							<Button className="w-full" size="sm" type="button">
								Continue With Email
							</Button>
						</form>
						<AuthDivider>OR</AuthDivider>
						<Button className="w-full" type="button" variant="outline">
							<GithubIcon data-icon="inline-start" />
							Continue With GitHub
						</Button>
					</div>
					<p className="text-muted-foreground text-sm">
						By clicking continue, you agree to our{" "}
						<a
							className="underline underline-offset-4 hover:text-primary"
							href="/legal/terms"
						>
							Terms of Service
						</a>{" "}
						and{" "}
						<a
							className="underline underline-offset-4 hover:text-primary"
							href="/legal/privacy"
						>
							Privacy Policy
						</a>
						.
					</p>
				</div>
			</div>
		</div>
	);
}

const GithubIcon = (props: React.ComponentProps<"svg">) => (
	<svg
		aria-label="GitHub"
		fill="currentColor"
		role="img"
		viewBox="0 0 1024 1024"
		{...props}
	>
		<path
			clipRule="evenodd"
			d="M8 0C3.58 0 0 3.58 0 8C0 11.54 2.29 14.53 5.47 15.59C5.87 15.66 6.02 15.42 6.02 15.21C6.02 15.02 6.01 14.39 6.01 13.72C4 14.09 3.48 13.23 3.32 12.78C3.23 12.55 2.84 11.84 2.5 11.65C2.22 11.5 1.82 11.13 2.49 11.12C3.12 11.11 3.57 11.7 3.72 11.94C4.44 13.15 5.59 12.81 6.05 12.6C6.12 12.08 6.33 11.73 6.56 11.53C4.78 11.33 2.92 10.64 2.92 7.58C2.92 6.71 3.23 5.99 3.74 5.43C3.66 5.23 3.38 4.41 3.82 3.31C3.82 3.31 4.49 3.1 6.02 4.13C6.66 3.95 7.34 3.86 8.02 3.86C8.7 3.86 9.38 3.95 10.02 4.13C11.55 3.09 12.22 3.31 12.22 3.31C12.66 4.41 12.38 5.23 12.3 5.43C12.81 5.99 13.12 6.7 13.12 7.58C13.12 10.65 11.25 11.33 9.47 11.53C9.76 11.78 10.01 12.26 10.01 13.01C10.01 14.08 10 14.94 10 15.21C10 15.42 10.15 15.67 10.55 15.59C13.71 14.53 16 11.53 16 8C16 3.58 12.42 0 8 0Z"
			fill="currentColor"
			fillRule="evenodd"
			transform="scale(64)"
		/>
	</svg>
);
