import { Badge } from "@locnative/ui/components/badge";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@locnative/ui/components/sheet";

export interface DeliveryAttemptItem {
	attempt: number;
	createdAt: string;
	error: string | null;
	event: string;
	id: number;
	ok: boolean;
	statusCode: number | null;
}

export interface DeliveryTimelineDrawerProps {
	attempts: DeliveryAttemptItem[];
	loading: boolean;
	onClose: () => void;
	open: boolean;
}

export function DeliveryTimelineDrawer({
	open,
	loading,
	attempts,
	onClose,
}: DeliveryTimelineDrawerProps) {
	return (
		<Sheet onOpenChange={(o) => !o && onClose()} open={open}>
			<SheetContent className="w-[460px] sm:max-w-[460px]">
				<SheetHeader>
					<SheetTitle>Delivery attempts</SheetTitle>
					<SheetDescription>
						{loading ? "Loading…" : `${attempts.length} recent attempts`}
					</SheetDescription>
				</SheetHeader>
				<div className="mt-4 space-y-2 overflow-auto">
					{attempts.map((a) => (
						<div
							className="flex items-center justify-between rounded-md border p-2 text-xs"
							key={a.id}
						>
							<div className="space-y-0.5">
								<div className="flex items-center gap-2">
									<span className="font-medium uppercase">{a.event}</span>
									<span className="text-muted-foreground">
										attempt {a.attempt}
									</span>
								</div>
								<span className="text-muted-foreground">{a.createdAt}</span>
								{a.error ? (
									<span className="text-destructive text-xs">{a.error}</span>
								) : null}
							</div>
							{a.ok ? (
								<Badge variant="secondary">{a.statusCode ?? "OK"}</Badge>
							) : (
								<Badge variant="destructive">{a.statusCode ?? "ERR"}</Badge>
							)}
						</div>
					))}
				</div>
			</SheetContent>
		</Sheet>
	);
}
