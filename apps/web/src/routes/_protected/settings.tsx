import { Button } from "@locnative/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import { Input } from "@locnative/ui/components/input";
import { Label } from "@locnative/ui/components/label";
import { Separator } from "@locnative/ui/components/separator";
import { Switch } from "@locnative/ui/components/switch";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@locnative/ui/components/tabs";
import { createFileRoute } from "@tanstack/react-router";
import {
	BellIcon,
	GlobeIcon,
	MonitorIcon,
	MoonIcon,
	PaletteIcon,
	ShieldIcon,
	SunIcon,
	UserIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { ActiveSessionsCard } from "@/components/settings/security/active-sessions-card.tsx";
import { DeleteAccountCard } from "@/components/settings/security/delete-account-card.tsx";
import { TwoFactorCard } from "@/components/settings/security/two-factor-card.tsx";
import { useSession } from "@/lib/auth-client";

const THEME_OPTIONS = [
	{ value: "light", label: "Light", icon: SunIcon },
	{ value: "dark", label: "Dark", icon: MoonIcon },
	{ value: "system", label: "System", icon: MonitorIcon },
] as const;

function ThemeSelector() {
	const { theme, setTheme } = useTheme();
	// Avoid a hydration mismatch: the resolved theme is only known on the
	// client, so defer reflecting the active selection until after mount.
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		setMounted(true);
	}, []);

	return (
		<div className="flex flex-wrap gap-3">
			{THEME_OPTIONS.map((option) => {
				const Icon = option.icon;
				const isActive = mounted && theme === option.value;
				return (
					<Button
						aria-pressed={isActive}
						className="min-w-24"
						key={option.value}
						onClick={() => setTheme(option.value)}
						size="sm"
						variant={isActive ? "default" : "outline"}
					>
						<Icon className="mr-1.5 size-4" />
						{option.label}
					</Button>
				);
			})}
		</div>
	);
}

export const Route = createFileRoute("/_protected/settings")({
	component: RouteComponent,
});

function RouteComponent() {
	const { data: session } = useSession();
	const user = session?.user;

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-semibold text-2xl tracking-tight">Settings</h1>
				<p className="text-muted-foreground text-sm">
					Manage your account and workspace preferences
				</p>
			</div>

			<Tabs className="space-y-4" defaultValue="profile">
				<TabsList>
					<TabsTrigger value="profile">
						<UserIcon className="mr-1.5 size-4" />
						Profile
					</TabsTrigger>
					<TabsTrigger value="notifications">
						<BellIcon className="mr-1.5 size-4" />
						Notifications
					</TabsTrigger>
					<TabsTrigger value="appearance">
						<PaletteIcon className="mr-1.5 size-4" />
						Appearance
					</TabsTrigger>
					<TabsTrigger value="security">
						<ShieldIcon className="mr-1.5 size-4" />
						Security
					</TabsTrigger>
				</TabsList>

				<TabsContent value="profile">
					<Card>
						<CardHeader>
							<CardTitle>Profile Information</CardTitle>
							<CardDescription>
								Update your personal details and workspace name
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<div className="space-y-2">
									<Label htmlFor="firstName">First Name</Label>
									<Input
										defaultValue={user?.name?.split(" ")[0] ?? ""}
										id="firstName"
										placeholder="First name"
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="lastName">Last Name</Label>
									<Input
										defaultValue={
											user?.name?.split(" ").slice(1).join(" ") ?? ""
										}
										id="lastName"
										placeholder="Last name"
									/>
								</div>
							</div>
							<div className="space-y-2">
								<Label htmlFor="email">Email</Label>
								<Input
									defaultValue={user?.email ?? ""}
									disabled
									id="email"
									type="email"
								/>
								<p className="text-muted-foreground text-xs">
									Email is managed through your authentication provider
								</p>
							</div>
							<div className="space-y-2">
								<Label htmlFor="workspace">Workspace Name</Label>
								<Input
									defaultValue="My Workspace"
									id="workspace"
									placeholder="Workspace name"
								/>
							</div>
							<Separator />
							<div className="space-y-2">
								<Label htmlFor="timezone">
									<GlobeIcon className="mr-1.5 inline size-4" />
									Default Region
								</Label>
								<Input
									defaultValue="Auto-detect"
									id="timezone"
									placeholder="Region preference"
								/>
								<p className="text-muted-foreground text-xs">
									Used as the default region bias for geocoding requests
								</p>
							</div>
							<div className="flex justify-end">
								<Button>Save Changes</Button>
							</div>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="notifications">
					<Card>
						<CardHeader>
							<CardTitle>Notification Preferences</CardTitle>
							<CardDescription>
								Choose what alerts and updates you receive
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-6">
							{[
								{
									title: "Usage Alerts",
									description: "Get notified when approaching your plan limits",
									defaultChecked: true,
								},
								{
									title: "Error Notifications",
									description:
										"Receive alerts for elevated error rates on your endpoints",
									defaultChecked: true,
								},
								{
									title: "Weekly Summary",
									description:
										"Receive a weekly email digest of your API usage",
									defaultChecked: false,
								},
								{
									title: "Product Updates",
									description:
										"Stay informed about new features and improvements",
									defaultChecked: true,
								},
								{
									title: "Billing Reminders",
									description: "Get notified before your subscription renews",
									defaultChecked: true,
								},
							].map((pref) => (
								<div
									className="flex items-center justify-between"
									key={pref.title}
								>
									<div>
										<p className="font-medium text-sm">{pref.title}</p>
										<p className="text-muted-foreground text-xs">
											{pref.description}
										</p>
									</div>
									<Switch defaultChecked={pref.defaultChecked} />
								</div>
							))}
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="appearance">
					<Card>
						<CardHeader>
							<CardTitle>Appearance</CardTitle>
							<CardDescription>
								Customize how Locnative looks for you
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-6">
							<div className="space-y-3">
								<Label>Theme</Label>
								<ThemeSelector />
								<p className="text-muted-foreground text-xs">
									System follows your device's appearance settings and updates
									automatically.
								</p>
							</div>
							<Separator />
							<div className="flex items-center justify-between">
								<div>
									<p className="font-medium text-sm">Compact Mode</p>
									<p className="text-muted-foreground text-xs">
										Reduce spacing in the sidebar and navigation
									</p>
								</div>
								<Switch />
							</div>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="security">
					<Card>
						<CardHeader>
							<CardTitle>Security</CardTitle>
							<CardDescription>
								Manage your security settings and sessions
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-6">
							<TwoFactorCard />
							<Separator />
							<ActiveSessionsCard />
							<Separator />
							<DeleteAccountCard />
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	);
}
