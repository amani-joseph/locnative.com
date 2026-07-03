import { Button } from "@locnative/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@locnative/ui/components/card";
import { Input } from "@locnative/ui/components/input";
import { Label } from "@locnative/ui/components/label";

export interface PointTestResult {
	/** Whether the point fell inside the unsaved drawn zone (undefined = none drawn). */
	drawnMatch?: boolean;
	zones: { id: number; name: string }[];
}

export interface PointTestToolProps {
	lat: string;
	lng: string;
	onLatChange: (value: string) => void;
	onLngChange: (value: string) => void;
	onPick: () => void;
	onTest: () => void;
	picking: boolean;
	result: PointTestResult | null;
	testing: boolean;
}

export function PointTestTool({
	lat,
	lng,
	onLatChange,
	onLngChange,
	onTest,
	onPick,
	picking,
	result,
	testing,
}: PointTestToolProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">Test a point</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2">
				<p className="text-muted-foreground text-xs">
					Click <span className="font-medium">Pick on map</span> then click the
					map, or type coordinates, to see which zones contain a point.
				</p>
				<div className="flex gap-2">
					<div className="flex-1 space-y-1">
						<Label htmlFor="test-lat">Lat</Label>
						<Input
							id="test-lat"
							onChange={(e) => onLatChange(e.target.value)}
							value={lat}
						/>
					</div>
					<div className="flex-1 space-y-1">
						<Label htmlFor="test-lng">Lng</Label>
						<Input
							id="test-lng"
							onChange={(e) => onLngChange(e.target.value)}
							value={lng}
						/>
					</div>
				</div>
				<Button
					className="w-full"
					onClick={onPick}
					size="sm"
					type="button"
					variant={picking ? "default" : "outline"}
				>
					{picking ? "Click the map…" : "Pick on map"}
				</Button>
				<Button
					className="w-full"
					disabled={testing}
					onClick={onTest}
					size="sm"
				>
					{testing ? "Testing…" : "Check zones"}
				</Button>
				{result ? (
					<div className="space-y-1 text-sm">
						<p className="text-muted-foreground">
							{result.zones.length === 0
								? "Point is in no saved zones."
								: `Saved zones: ${result.zones.map((z) => z.name).join(", ")}`}
						</p>
						{result.drawnMatch === undefined ? null : (
							<p className="text-muted-foreground">
								{result.drawnMatch
									? "Inside the unsaved drawn zone."
									: "Outside the unsaved drawn zone."}
							</p>
						)}
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}
