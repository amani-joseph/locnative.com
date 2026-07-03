import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@locnative/ui/components/select";

export interface ProjectOption {
	id: string;
	name: string;
}

export interface ActiveProjectSelectorProps {
	activeId: string | null;
	onSelect: (projectId: string) => void;
	projects: ProjectOption[];
}

export function ActiveProjectSelector({
	projects,
	activeId,
	onSelect,
}: ActiveProjectSelectorProps) {
	if (projects.length === 0) {
		return <p className="text-muted-foreground text-sm">No projects yet.</p>;
	}
	return (
		<Select
			onValueChange={(value) => onSelect(value ?? "")}
			value={activeId ?? ""}
		>
			<SelectTrigger className="w-56">
				<SelectValue placeholder="Select a project">
					{(value: string | null) =>
						projects.find((project) => project.id === value)?.name ??
						"Select a project"
					}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{projects.map((project) => (
					<SelectItem key={project.id} value={project.id}>
						{project.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
