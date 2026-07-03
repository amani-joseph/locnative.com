import { Button } from "@locnative/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import { Input } from "@locnative/ui/components/input";
import { createFileRoute } from "@tanstack/react-router";
import {
	BookOpenIcon,
	ExternalLinkIcon,
	FileTextIcon,
	HelpCircleIcon,
	MessageCircleIcon,
	SearchIcon,
	VideoIcon,
} from "lucide-react";

export const Route = createFileRoute("/_protected/help")({
	component: RouteComponent,
});

const categories = [
	{
		title: "Getting Started",
		description: "Learn the basics of the Locnative API",
		icon: <BookOpenIcon className="size-5" />,
		articles: 8,
	},
	{
		title: "API Reference",
		description: "Detailed documentation for every endpoint",
		icon: <FileTextIcon className="size-5" />,
		articles: 12,
	},
	{
		title: "Tutorials",
		description: "Step-by-step guides for common use cases",
		icon: <VideoIcon className="size-5" />,
		articles: 6,
	},
	{
		title: "Troubleshooting",
		description: "Solutions for common errors and issues",
		icon: <HelpCircleIcon className="size-5" />,
		articles: 15,
	},
];

const faqs = [
	{
		question: "What address formats does Locnative support?",
		answer:
			"Locnative supports free-form text addresses, structured addresses, and coordinate pairs (lat/lng). The autocomplete endpoint handles partial input for real-time search.",
	},
	{
		question: "How is usage calculated?",
		answer:
			"Each API call counts as one request, regardless of the endpoint. Batch operations count each address in the batch as a separate request.",
	},
	{
		question: "What happens if I exceed my plan limits?",
		answer:
			"You'll receive a warning at 80% usage. At 100%, requests return a 429 status code. Upgrade your plan or wait for the next billing cycle to resume.",
	},
	{
		question: "Do you offer an SLA?",
		answer:
			"Enterprise plans include a 99.9% uptime SLA. Pro plans target 99.5% uptime but without a contractual guarantee.",
	},
];

function RouteComponent() {
	return (
		<div className="flex flex-col gap-6">
			<div className="text-center">
				<h1 className="font-semibold text-2xl tracking-tight">Help Center</h1>
				<p className="text-muted-foreground text-sm">
					Find answers, guides, and resources to get the most out of Locnative
				</p>
			</div>

			<div className="mx-auto w-full max-w-lg">
				<div className="relative">
					<SearchIcon className="absolute top-3 left-3 size-4 text-muted-foreground" />
					<Input className="pl-9" placeholder="Search for help articles..." />
				</div>
			</div>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				{categories.map((cat) => (
					<Card
						className="cursor-pointer transition-colors hover:bg-muted/50"
						key={cat.title}
					>
						<CardHeader>
							<div className="flex items-center gap-3">
								<div className="flex size-10 items-center justify-center rounded-lg bg-muted">
									{cat.icon}
								</div>
								<div>
									<CardTitle className="text-base">{cat.title}</CardTitle>
									<CardDescription className="text-xs">
										{cat.articles} articles
									</CardDescription>
								</div>
							</div>
						</CardHeader>
						<CardContent>
							<p className="text-muted-foreground text-sm">{cat.description}</p>
						</CardContent>
					</Card>
				))}
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Frequently Asked Questions</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{faqs.map((faq) => (
						<div className="space-y-1.5" key={faq.question}>
							<p className="font-medium text-sm">{faq.question}</p>
							<p className="text-muted-foreground text-sm">{faq.answer}</p>
						</div>
					))}
				</CardContent>
			</Card>

			<Card className="bg-muted/50">
				<CardContent className="flex flex-col items-center gap-4 py-8 text-center">
					<MessageCircleIcon className="size-8 text-muted-foreground" />
					<div>
						<p className="font-semibold text-lg">Still need help?</p>
						<p className="text-muted-foreground text-sm">
							Our support team is available Monday through Friday, 9am-6pm EST
						</p>
					</div>
					<div className="flex gap-3">
						<Button>
							<MessageCircleIcon className="size-4" />
							Contact Support
						</Button>
						<Button variant="outline">
							<ExternalLinkIcon className="size-4" />
							Community Forum
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
