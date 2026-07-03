import { Button } from "@locnative/ui/components/button";
import { Textarea } from "@locnative/ui/components/textarea";
import { useRef, useState } from "react";

export interface BatchInputProps {
	onSubmit: (text: string) => void;
	submitting: boolean;
}

export function BatchInput({ submitting, onSubmit }: BatchInputProps) {
	const [text, setText] = useState("");
	const fileRef = useRef<HTMLInputElement>(null);

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) {
			return;
		}
		const reader = new FileReader();
		reader.onload = (ev) => {
			const content = ev.target?.result;
			if (typeof content === "string") {
				setText(content);
			}
		};
		reader.readAsText(file);
		// Reset input so the same file can be re-selected
		e.target.value = "";
	};

	return (
		<div className="space-y-2">
			<Textarea
				className="min-h-[120px] font-mono text-sm"
				disabled={submitting}
				onChange={(e) => setText(e.target.value)}
				placeholder={
					"Paste addresses here, one per line.\nOr upload a CSV — the first column will be used."
				}
				value={text}
			/>
			<div className="flex items-center gap-2">
				<input
					accept=".csv,.txt"
					className="hidden"
					onChange={handleFileChange}
					ref={fileRef}
					type="file"
				/>
				<Button
					disabled={submitting}
					onClick={() => fileRef.current?.click()}
					size="sm"
					type="button"
					variant="outline"
				>
					Upload CSV
				</Button>
				<Button
					disabled={submitting || text.trim().length === 0}
					onClick={() => onSubmit(text)}
					type="button"
				>
					{submitting ? "Submitting…" : "Geocode batch"}
				</Button>
			</div>
		</div>
	);
}
