"use client";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@locnative/ui/components/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@locnative/ui/components/dropdown-menu";
import {
	CreditCardIcon,
	LogOutIcon,
	SettingsIcon,
	UserIcon,
} from "lucide-react";
import { signOut, useSession } from "@/lib/auth-client";

export function NavUser() {
	const { data: session } = useSession();
	const user = session?.user;

	const name = user?.name ?? "User";
	const email = user?.email ?? "";
	const avatarUrl = user?.image ?? "";
	const initials = name.charAt(0).toUpperCase();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				nativeButton={false}
				render={<Avatar className="size-8" />}
			>
				<AvatarImage src={avatarUrl} />
				<AvatarFallback>{initials}</AvatarFallback>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-60">
				<DropdownMenuGroup>
					<DropdownMenuLabel className="px-2 py-2">
						<div className="flex items-center gap-3">
							<Avatar className="size-10">
								<AvatarImage src={avatarUrl} />
								<AvatarFallback>{initials}</AvatarFallback>
							</Avatar>
							<div>
								<span className="font-medium text-foreground">{name}</span>{" "}
								<br />
								<div className="max-w-full overflow-hidden overflow-ellipsis whitespace-nowrap text-muted-foreground text-xs">
									{email}
								</div>
							</div>
						</div>
					</DropdownMenuLabel>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem>
						<UserIcon />
						Account
					</DropdownMenuItem>
					<DropdownMenuItem>
						<SettingsIcon />
						Settings
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem>
						<CreditCardIcon />
						Plan & Billing
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						className="w-full cursor-pointer"
						onClick={() => {
							signOut()
								.then(() => window.location.assign("/"))
								.catch(() => undefined);
						}}
						variant="destructive"
					>
						<LogOutIcon />
						Log out
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
