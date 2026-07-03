import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export default function Footer() {
	const footerLinksProduct = [
		{ label: "Coverage", href: "/coverage" },
		{ label: "Pricing", href: "/pricing" },
		{ label: "Documentation", href: "/docs" },
		{ label: "Changelog", href: "/changelog" },
		// Root-relative so they resolve from any page, not just the homepage.
		{ label: "Capabilities", href: "/#capabilities" },
		{ label: "API in action", href: "/#api" },
	];
	const footerLinksCompany = [
		{ label: "Contact", href: "mailto:hello@locnative.com" },
	];
	const footerLinksLegal = [
		{ label: "Privacy Policy", href: "/legal/privacy" },
		{ label: "Terms of Service", href: "/legal/terms" },
		{ label: "Acceptable Use", href: "/legal/acceptable-use" },
	];
	return (
		<footer className="dark bg-background">
			<div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-24 lg:px-8">
				<div className="flex flex-col gap-16">
					<div className="grid grid-cols-12 gap-6">
						<div
							className="fade-in slide-in-from-bottom-10 col-span-12 animate-in fill-mode-both delay-100 duration-1000 ease-in-out md:col-span-6"
							id="pricing"
						>
							<p className="mb-2 font-medium text-muted-foreground text-sm">
								Locnative
							</p>
							<h2 className="mb-6 font-medium text-3xl text-foreground sm:text-5xl">
								Predictable pricing for international location workloads in
								production.
							</h2>
							<p className="mb-6 max-w-xl text-muted-foreground">
								See tiers, included volume, and overages when you publish
								pricing or talk to us—built for budgets and forecasting, not
								surprise spikes alone.
							</p>
							<a
								className={cn(
									buttonVariants({ variant: "default" }),
									"h-auto rounded-full bg-teal-400 px-6 py-3.5 text-teal-950 hover:bg-teal-400/80"
								)}
								href="mailto:hello@locnative.com"
							>
								Talk to us
							</a>
						</div>
						<div className="fade-in slide-in-from-bottom-10 col-span-12 animate-in fill-mode-both delay-100 duration-1000 ease-in-out md:col-span-2">
							<p className="mb-3 font-medium text-foreground text-sm">
								Product
							</p>
							<div className="flex flex-col gap-4">
								{footerLinksProduct.map((link) => (
									<a
										className="block text-base text-muted-foreground hover:text-primary"
										href={link.href}
										key={link.label}
									>
										{link.label}
									</a>
								))}
							</div>
						</div>
						<div className="fade-in slide-in-from-bottom-10 col-span-12 animate-in fill-mode-both delay-200 duration-1000 ease-in-out md:col-span-2">
							<p className="mb-3 font-medium text-foreground text-sm">
								Company
							</p>
							<div className="flex flex-col gap-4">
								{footerLinksCompany.map((link) => (
									<a
										className="block text-base text-muted-foreground hover:text-primary"
										href={link.href}
										key={link.label}
									>
										{link.label}
									</a>
								))}
							</div>
						</div>
						<div className="fade-in slide-in-from-bottom-10 col-span-12 animate-in fill-mode-both delay-300 duration-1000 ease-in-out md:col-span-2">
							<p className="mb-3 font-medium text-foreground text-sm">Legal</p>
							<div className="flex flex-col gap-4">
								{footerLinksLegal.map((link) => (
									<a
										className="block text-base text-muted-foreground hover:text-primary"
										href={link.href}
										key={link.label}
									>
										{link.label}
									</a>
								))}
							</div>
						</div>
					</div>
					<div className="flex flex-col gap-12">
						<Separator />
						<p className="fade-in slide-in-from-bottom-10 animate-in fill-mode-both text-muted-foreground text-sm delay-300 duration-1000 ease-in-out">
							© {new Date().getFullYear()} Locnative. All rights reserved.
						</p>
					</div>
				</div>
			</div>
		</footer>
	);
}
