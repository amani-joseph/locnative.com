import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@locnative/ui/components/sheet";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@locnative/ui/components/table";

export interface ZoneAddressItem {
	id: number;
	locality: string;
	postcode: string;
	state: string;
	streetName: string;
}

export interface ZoneAddressesDrawerProps {
	addresses: ZoneAddressItem[];
	loading: boolean;
	onClose: () => void;
	open: boolean;
	truncated: boolean;
	zoneName: string;
}

export function ZoneAddressesDrawer({
	open,
	zoneName,
	loading,
	truncated,
	addresses,
	onClose,
}: ZoneAddressesDrawerProps) {
	return (
		<Sheet onOpenChange={(o) => !o && onClose()} open={open}>
			<SheetContent className="w-[480px] sm:max-w-[480px]">
				<SheetHeader>
					<SheetTitle>Addresses in {zoneName}</SheetTitle>
					<SheetDescription>
						{loading
							? "Loading…"
							: `${addresses.length} shown${truncated ? " (capped at 10,000)" : ""}`}
					</SheetDescription>
				</SheetHeader>
				<div className="mt-4 overflow-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Street</TableHead>
								<TableHead>Locality</TableHead>
								<TableHead>Postcode</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{addresses.map((a) => (
								<TableRow key={a.id}>
									<TableCell>{a.streetName}</TableCell>
									<TableCell>
										{a.locality} {a.state}
									</TableCell>
									<TableCell>{a.postcode}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			</SheetContent>
		</Sheet>
	);
}
