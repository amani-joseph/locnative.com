import { LogoIcon } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup } from "@/components/ui/field";

const VerifyEmail = () => {
	return (
		<section className="relative flex min-h-screen items-center bg-foreground dark:bg-background">
			<div className="pointer-events-none absolute inset-0 right-0 hidden overflow-hidden md:block">
				{/* Outer big circle */}
				<div className="absolute top-0 left-1/1 h-650 w-650 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10" />
				{/* Inner circle */}
				<div className="absolute top-0 left-1/1 h-175 w-175 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground dark:bg-background" />
			</div>
			<div className="mx-auto w-full max-w-lg px-4 py-10 sm:px-0 md:py-20">
				<Card className="relative px-6 py-8 sm:p-12">
					<CardHeader className="gap-6 p-0 text-center">
						<div className="mx-auto">
							<a href="/">
								<LogoIcon alt="Locnative" className="h-10 w-10" />
							</a>
						</div>
						<div className="flex flex-col gap-1">
							<CardTitle className="font-medium text-2xl text-card-foreground">
								Verify your email
							</CardTitle>
							<CardDescription className="font-normal text-muted-foreground text-sm">
								An activation link has been sent to your email address:
								hello@example.com. Please check your inbox and click on the link
								to complete the activation process.
							</CardDescription>
						</div>
					</CardHeader>
					<CardContent className="p-0">
						<form>
							<FieldGroup>
								<Field className="gap-4">
									<Button
										className="h-10 cursor-pointer rounded-xl hover:bg-primary/80"
										size={"lg"}
										type="submit"
									>
										Verify Now
									</Button>
									<FieldDescription className="text-center font-normal text-muted-foreground text-sm">
										Didn&apos;t get the email?{" "}
										<button
											className="no-underline! font-medium text-card-foreground"
											type="button"
										>
											Resend
										</button>
									</FieldDescription>
								</Field>
							</FieldGroup>
						</form>
					</CardContent>
				</Card>
			</div>
		</section>
	);
};

export default VerifyEmail;
