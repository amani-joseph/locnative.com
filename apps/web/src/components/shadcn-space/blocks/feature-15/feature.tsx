import { BookOpen, Globe2, Wallet } from "lucide-react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";

const accordionItems = [
	{
		id: "predictable-pricing",
		icon: Wallet,
		title: "Predictable pricing for production traffic",
		description:
			"Forecast spend without surprise spikes when usage jumps—common with large consumer-maps APIs priced for unpredictable query volume. Locnative is structured for app workloads so finance and engineering stay aligned. Confirm allowances, caching, and storage rules in the docs before you ship.",
	},
	{
		id: "developer-experience",
		icon: BookOpen,
		title: "Developer experience that respects your time",
		description:
			"Keys, versioning, and errors you can act on—not opaque failures. Get to a first successful request quickly with examples and stable contracts, built for product engineers shipping features, not slide decks.",
	},
	{
		id: "coverage-api-first",
		icon: Globe2,
		title: "Coverage tuned for in-app location UX",
		description:
			"Reliable place search, autocomplete, and geocoding for addresses and venues. US and Australia anchor the data, with several European countries live and coverage expanding across South America, Africa, and Asia. See regions, endpoints, and data guarantees in the documentation.",
	},
];

const Feature = () => {
	return (
		<section id="features">
			<div className="mx-auto max-w-7xl px-4">
				<div className="border-border border-x">
					<div className="px-4 sm:px-7 lg:px-16">
						<div className="flex max-w-2xl flex-col gap-4 py-8 sm:gap-6 sm:py-10 lg:py-20">
							<h2 className="font-medium text-3xl sm:text-4xl md:text-5xl">
								Built for{" "}
								<span className="bg-[linear-gradient(90deg,var(--foreground)_-20%,#3B82F6_94.54%,#FFFFFF_104.51%)] bg-clip-text text-transparent">
									locations in production
								</span>
							</h2>
							<p className="max-w-xl text-base text-muted-foreground sm:text-lg">
								Pricing you can plan around, APIs you can integrate quickly, and
								international coverage aimed at real app flows—not a generic
								maps platform bolt-on.
							</p>
						</div>
					</div>
					<div className="grid grid-cols-1 border-border border-t">
						<div>
							<Accordion
								defaultValue={["predictable-pricing"]}
								multiple={false}
							>
								{accordionItems.map((item) => (
									<AccordionItem
										className={
											"data-open:border-blue-500 data-open:border-t-2 data-open:border-b data-open:border-b-border"
										}
										key={item.id}
										value={item.id}
									>
										<AccordionTrigger className="flex w-full cursor-pointer flex-col items-start rounded-none border-0 p-6 hover:no-underline **:data-[slot='accordion-trigger-icon']:hidden xl:p-12">
											{/* Collapsed: inline icon + title */}
											<div className="flex w-full items-center gap-3 group-aria-expanded/accordion-trigger:hidden">
												<item.icon
													className="shrink-0 text-muted-foreground"
													size={24}
												/>
												<span className="font-medium text-muted-foreground text-xl xl:text-2xl">
													{item.title}
												</span>
											</div>
											{/* Expanded: card layout with icon boxes + bold title */}
											<div className="hidden w-full flex-col items-start gap-10 group-aria-expanded/accordion-trigger:flex xl:gap-20">
												<div>
													<item.icon
														className="text-muted-foreground"
														size={24}
													/>
												</div>
												<span className="font-semibold text-foreground text-xl xl:text-2xl">
													{item.title}
												</span>
											</div>

											<AccordionContent className="pt-3 pb-0 font-normal text-lg text-muted-foreground xl:pt-5">
												{item.description}
											</AccordionContent>
										</AccordionTrigger>
									</AccordionItem>
								))}
							</Accordion>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
};

export default Feature;
