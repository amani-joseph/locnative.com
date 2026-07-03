import type { Input } from "@locnative/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@locnative/ui/components/input-group";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@locnative/ui/components/tooltip";
import { cn } from "@locnative/ui/lib/utils";
import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import {
	type ChangeEvent,
	type ComponentProps,
	createContext,
	type ReactNode,
	useContext,
	useDeferredValue,
	useEffect,
	useMemo,
	useState,
} from "react";

const PasswordInputContext = createContext<{ password: string } | null>(null);

export function PasswordInput({
	children,
	onChange,
	value,
	defaultValue,
	...props
}: Omit<ComponentProps<typeof Input>, "type"> & {
	children?: ReactNode;
}) {
	const [showPassword, setShowPassword] = useState(false);
	const [password, setPassword] = useState(defaultValue ?? "");

	const Icon = showPassword ? EyeOffIcon : EyeIcon;
	const currentValue = value ?? password;

	const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
		setPassword(e.target.value);
		onChange?.(e);
	};

	return (
		<PasswordInputContext value={{ password: currentValue.toString() }}>
			<div className="space-y-3">
				<InputGroup>
					<InputGroupInput
						{...props}
						defaultValue={defaultValue}
						onChange={handleChange}
						type={showPassword ? "text" : "password"}
						value={value}
					/>
					<InputGroupAddon align="inline-end">
						<InputGroupButton
							onClick={() => setShowPassword((p) => !p)}
							size="icon-xs"
						>
							<Icon className="size-4.5" />
							<span className="sr-only">
								{showPassword ? "Hide password" : "Show password"}
							</span>
						</InputGroupButton>
					</InputGroupAddon>
				</InputGroup>
				{children}
			</div>
		</PasswordInputContext>
	);
}

export function PasswordInputStrengthChecker() {
	const [optionsLoaded, setOptionsLoaded] = useState(false);
	const [errorLoadingOptions, setErrorLoadingOptions] = useState(false);

	const { password } = usePasswordInput();
	const deferredPassword = useDeferredValue(password);
	const strengthResult = useMemo(() => {
		if (!optionsLoaded || deferredPassword.length === 0) {
			return { score: 0, feedback: { warning: undefined } } as const;
		}

		return zxcvbn(deferredPassword);
	}, [optionsLoaded, deferredPassword]);

	useEffect(() => {
		Promise.all([
			import("@zxcvbn-ts/language-common"),
			import("@zxcvbn-ts/language-en"),
		])
			.then(([common, english]) => {
				zxcvbnOptions.setOptions({
					translations: english.translations,
					graphs: common.adjacencyGraphs,
					maxLength: 50,
					dictionary: {
						...common.dictionary,
						...english.dictionary,
					},
				});
				setOptionsLoaded(true);
			})
			.catch(() => setErrorLoadingOptions(true));
	}, []);

	function getLabel() {
		if (deferredPassword.length === 0) {
			return "Password strength";
		}
		if (!optionsLoaded) {
			return "Loading strength checker";
		}

		const score = strengthResult.score;
		switch (score) {
			case 0:
			case 1:
				return "Very weak";
			case 2:
				return "Weak";
			case 3:
				return "Strong";
			case 4:
				return "Very strong";
			default:
				throw new Error(`Invalid score: ${score satisfies never}`);
		}
	}

	const label = getLabel();

	if (errorLoadingOptions) {
		return null;
	}

	return (
		<div className="space-y-0.5">
			<div
				aria-label="Password Strength"
				aria-valuemax={4}
				aria-valuemin={0}
				aria-valuenow={strengthResult.score}
				aria-valuetext={label}
				className="flex gap-1"
				role="progressbar"
			>
				{["0", "1", "2", "3"].map((segment) => {
					const segmentIndex = Number(segment);
					const color =
						strengthResult.score >= 3 ? "bg-primary" : "bg-destructive";

					return (
						<div
							className={cn(
								"h-1 flex-1 rounded-full",
								strengthResult.score > segmentIndex ? color : "bg-secondary"
							)}
							key={segment}
						/>
					);
				})}
			</div>
			<div className="flex justify-end text-muted-foreground text-sm">
				{strengthResult.feedback.warning == null ? (
					label
				) : (
					<Tooltip>
						<TooltipTrigger className="underline underline-offset-1">
							{label}
						</TooltipTrigger>
						<TooltipContent className="text-base" side="bottom" sideOffset={4}>
							{strengthResult.feedback.warning}
						</TooltipContent>
					</Tooltip>
				)}
			</div>
		</div>
	);
}

const usePasswordInput = () => {
	const context = useContext(PasswordInputContext);
	if (context == null) {
		throw new Error(
			"usePasswordInput must be used within a PasswordInputContext"
		);
	}
	return context;
};
