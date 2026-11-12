import { Button } from "@locnative/ui/components/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@locnative/ui/components/select";
import { Link } from "@tanstack/react-router";
import { FolderPlusIcon } from "lucide-react";

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
		return (
			<Button
				render={
					<Link to="/projects">
						<FolderPlusIcon className="size-4" />
						Create a project
					</Link>
				}
				size="sm"
				variant="outline"
			/>
		);
	}
	return (
		<Select
			onValueChange={(value) => onSelect(value ?? "")}
			value={activeId ?? ""}
		>
			<SelectTrigger className="w-full sm:w-56">
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
