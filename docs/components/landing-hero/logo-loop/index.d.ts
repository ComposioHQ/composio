import type { CSSProperties, ReactNode } from "react";

interface LogoImageItem {
	src: string;
	srcSet?: string;
	sizes?: string;
	width?: number;
	height?: number;
	alt?: string;
	title?: string;
	href?: string;
}

interface LogoNodeItem {
	node: ReactNode;
	ariaLabel?: string;
	title?: string;
	href?: string;
}

type LogoItem = LogoImageItem | LogoNodeItem;

interface LogoLoopProps<Item extends LogoItem = LogoItem> {
	logos: Item[];
	speed?: number;
	direction?: "left" | "right" | "up" | "down";
	width?: string | number;
	logoHeight?: number;
	gap?: number;
	pauseOnHover?: boolean;
	hoverSpeed?: number;
	fadeOut?: boolean;
	fadeOutColor?: string;
	scaleOnHover?: boolean;
	renderItem?: (item: Item, key: string) => ReactNode;
	ariaLabel?: string;
	className?: string;
	style?: CSSProperties;
}

export const LogoLoop: <Item extends LogoItem = LogoItem>(
	props: LogoLoopProps<Item>
) => ReactNode;
export default LogoLoop;
