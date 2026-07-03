import { Button } from "@locnative/ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@locnative/ui/components/table";

export interface BatchResultRow {
	address?: {
		formattedAddress: string;
		latitude: number;
		longitude: number;
	};
	error?: string;
	input: string;
	matched: boolean;
}

export interface ResultsTableProps {
	results: BatchResultRow[];
}

function download(filename: string, content: string, type: string) {
	const blob = new Blob([content], { type });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

function toCsv(results: BatchResultRow[]): string {
	const header = "input,matched,formatted_address,latitude,longitude,error";
	const escapeCsv = (v: string) => `"${v.replace(/"/g, '""')}"`;
	const rows = results.map((r) =>
		[
			escapeCsv(r.input),
			r.matched ? "true" : "false",
			escapeCsv(r.address?.formattedAddress ?? ""),
			r.address?.latitude ?? "",
			r.address?.longitude ?? "",
			escapeCsv(r.error ?? ""),
		].join(",")
	);
	return [header, ...rows].join("\n");
}

export function ResultsTable({ results }: ResultsTableProps) {
	return (
		<div className="space-y-2">
			<div className="flex justify-end gap-2">
				<Button
					onClick={() =>
						download("geocode-results.csv", toCsv(results), "text/csv")
					}
					size="sm"
					type="button"
					variant="outline"
				>
					Export CSV
				</Button>
				<Button
					onClick={() =>
						download(
							"geocode-results.json",
							JSON.stringify(results, null, 2),
							"application/json"
						)
					}
					size="sm"
					type="button"
					variant="outline"
				>
					Export JSON
				</Button>
			</div>
			<div className="max-h-[360px] overflow-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Input</TableHead>
							<TableHead>Matched address</TableHead>
							<TableHead>Lat/Lng</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{results.map((r, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: results are a static snapshot
							<TableRow key={i}>
								<TableCell className="max-w-[200px] truncate text-xs">
									{r.input}
								</TableCell>
								<TableCell className="text-xs">
									{r.matched ? (
										r.address?.formattedAddress
									) : (
										<span className="text-destructive">
											{r.error ?? "No match"}
										</span>
									)}
								</TableCell>
								<TableCell className="text-xs">
									{r.matched && r.address
										? `${r.address.latitude.toFixed(5)}, ${r.address.longitude.toFixed(5)}`
										: "—"}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
