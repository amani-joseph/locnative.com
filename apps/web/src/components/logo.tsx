import { cn } from "@locnative/ui/lib/utils";
import type React from "react";

const brandLogo = "/brand/logo-horizontal.svg";
const brandLogoInverted = "/brand/logo-horizontal-inverted.svg";
const brandLogoMark = "/brand/logo-mark.svg";
const brandLogoMarkInverted = "/brand/logo-mark-inverted.svg";

/** Matches `viewBox` of logo-horizontal.svg for CLS. */
const BRAND_LOGO_WIDTH = 330;
const BRAND_LOGO_HEIGHT = 90;
/** Matches `viewBox` of logo-mark.svg for CLS. */
const BRAND_LOGO_MARK_WIDTH = 100;
const BRAND_LOGO_MARK_HEIGHT = 100;

type LogoProps = React.ComponentPropsWithoutRef<"span"> & {
	alt?: string;
	imgClassName?: string;
};

export function Logo({
	className,
	imgClassName,
	alt = "locnative",
	...spanProps
}: LogoProps) {
	const imgClass = cn("h-10 w-auto object-contain object-left", imgClassName);

	return (
		<span
			aria-label={alt}
			className={cn("inline-flex items-center", className)}
			role="img"
			{...spanProps}
		>
			<img
				alt=""
				className={cn(imgClass, "hidden dark:block")}
				decoding="async"
				fetchPriority="low"
				height={BRAND_LOGO_HEIGHT}
				loading="lazy"
				src={brandLogo}
				width={BRAND_LOGO_WIDTH}
			/>
			<img
				alt=""
				className={cn(imgClass, "dark:hidden")}
				decoding="async"
				fetchPriority="low"
				height={BRAND_LOGO_HEIGHT}
				loading="lazy"
				src={brandLogoInverted}
				width={BRAND_LOGO_WIDTH}
			/>
		</span>
	);
}

type LogoIconProps = Omit<React.ComponentPropsWithoutRef<"img">, "src">;

export function LogoIcon({ className, alt = "", ...props }: LogoIconProps) {
	return (
		<span aria-label={alt || undefined} className="inline-flex" role="img">
			<img
				alt=""
				className={cn(
					"h-6 w-auto shrink-0 object-contain dark:hidden",
					className
				)}
				decoding="async"
				fetchPriority="low"
				height={BRAND_LOGO_MARK_HEIGHT}
				loading="lazy"
				src={brandLogoMarkInverted}
				width={BRAND_LOGO_MARK_WIDTH}
				{...props}
			/>
			<img
				alt=""
				className={cn(
					"hidden h-6 w-auto shrink-0 object-contain dark:block",
					className
				)}
				decoding="async"
				fetchPriority="low"
				height={BRAND_LOGO_MARK_HEIGHT}
				loading="lazy"
				src={brandLogoMark}
				width={BRAND_LOGO_MARK_WIDTH}
				{...props}
			/>
		</span>
	);
}
