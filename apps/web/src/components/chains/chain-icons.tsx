import { type ComponentProps } from "react";

type IconProps = ComponentProps<"svg"> & { size?: number };

function defaultProps(size: number | undefined, props: Omit<IconProps, "size">): ComponentProps<"svg"> {
  const s = size ?? 20;
  const { ...rest } = props;
  return {
    width: s,
    height: s,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    ...rest,
  };
}

export function ArbitrumIcon({ size, ...props }: IconProps) {
  return (
    <svg {...defaultProps(size, props)}>
      <rect width="24" height="24" rx="6" fill="#213147" />
      <path
        d="M12.56 6.28l3.82 6.15-.01.02-1.27 2.05-2.55-4.12-.01-.02-2.53 4.1-1.27-2.04 3.82-6.14z"
        fill="#28A0F0"
      />
      <path
        d="M15.1 14.5l1.58 2.55.01.01 1.27-2.05-1.58-2.55-1.28 2.04zM8.63 12.46L7.04 15l1.27 2.06 1.59-2.56-1.27-2.04z"
        fill="#fff"
      />
      <path
        d="M14.38 17.06l-2.38.01-2.37-.01-1.28 2.06h7.31l-1.28-2.06z"
        fill="#28A0F0"
      />
    </svg>
  );
}

export function BaseIcon({ size, ...props }: IconProps) {
  return (
    <svg {...defaultProps(size, props)}>
      <rect width="24" height="24" rx="6" fill="#0052FF" />
      <path
        d="M12 19.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15z"
        fill="#0052FF"
      />
      <path
        d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z"
        fill="#fff"
      />
      <path
        d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"
        fill="#0052FF"
      />
      <path
        d="M14.5 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"
        fill="#fff"
      />
    </svg>
  );
}

export function OptimismIcon({ size, ...props }: IconProps) {
  return (
    <svg {...defaultProps(size, props)}>
      <rect width="24" height="24" rx="6" fill="#FF0420" />
      <path
        d="M8.86 15.37c-.7 0-1.26-.18-1.66-.54-.4-.36-.6-.87-.6-1.52 0-.16.02-.35.06-.56l.83-4.12h1.63l-.82 4.07c-.02.12-.04.23-.04.33 0 .68.37 1.02 1.1 1.02.34 0 .64-.1.91-.28.27-.19.47-.45.6-.79l.89-4.35h1.63l-.88 4.35c-.2.96-.58 1.68-1.14 2.14-.56.47-1.27.7-2.12.7l-.39.55zm5.07-.18l1.24-6.1h2.5c.72 0 1.27.16 1.63.49.37.33.55.78.55 1.36 0 .18-.02.37-.07.57-.15.72-.46 1.28-.93 1.66-.46.39-1.04.58-1.72.58h-1.36l-.48 2.36h-1.36v-.92zm2.12-3.7h1.04c.32 0 .58-.1.79-.3.2-.2.34-.46.41-.78.02-.1.03-.2.03-.29 0-.24-.07-.42-.22-.55-.14-.13-.36-.19-.64-.19h-1.01l-.4 2.11z"
        fill="#fff"
      />
    </svg>
  );
}

export function SepoliaIcon({ size, ...props }: IconProps) {
  return (
    <svg {...defaultProps(size, props)}>
      <rect width="24" height="24" rx="6" fill="#8B5CF6" />
      <path d="M12 4.5l-5 8.5 5 3 5-3-5-8.5z" fill="#C4B5FD" />
      <path d="M12 4.5v11l5-3-5-8z" fill="#A78BFA" />
      <path d="M7 13l5 3v4.5L7 16.5V13z" fill="#C4B5FD" />
      <path d="M17 13l-5 3v4.5l5-4V13z" fill="#A78BFA" />
    </svg>
  );
}

export function AvalancheIcon({ size, ...props }: IconProps) {
  return (
    <svg {...defaultProps(size, props)}>
      <rect width="24" height="24" rx="6" fill="#E84142" />
      <path
        d="M16.28 16.5H14.2c-.3 0-.45-.04-.6-.17-.15-.14-.26-.35-.26-.35l-1.3-2.42s-.08-.14-.16-.14-.15.14-.15.14L10.4 16c0 0-.1.2-.25.33-.15.14-.33.17-.6.17H7.72l4.16-7.5 4.4 7.5z"
        fill="#fff"
      />
    </svg>
  );
}

export function GenericChainIcon({ size, ...props }: IconProps) {
  return (
    <svg {...defaultProps(size, props)}>
      <rect width="24" height="24" rx="6" fill="var(--color-app-bg-subtle, #1a1a2e)" />
      <circle cx="12" cy="12" r="5" stroke="var(--color-app-muted, #888)" strokeWidth="1.5" fill="none" />
      <circle cx="12" cy="7" r="1.5" fill="var(--color-app-muted, #888)" />
      <circle cx="16.33" cy="14.5" r="1.5" fill="var(--color-app-muted, #888)" />
      <circle cx="7.67" cy="14.5" r="1.5" fill="var(--color-app-muted, #888)" />
    </svg>
  );
}

export type ChainMeta = {
  name: string;
  icon: (props: IconProps) => React.ReactElement;
  color: string;
  accent: string;
};

const arbitrum: ChainMeta = { name: "Arbitrum", icon: ArbitrumIcon, color: "#213147", accent: "#2dd4bf" };
const avalancheFuji: ChainMeta = { name: "Avalanche Fuji", icon: AvalancheIcon, color: "#E84142", accent: "#f87171" };
const base: ChainMeta = { name: "Base", icon: BaseIcon, color: "#0052FF", accent: "#14b8a6" };
const optimism: ChainMeta = { name: "Optimism", icon: OptimismIcon, color: "#FF0420", accent: "#5eead4" };
const sepolia: ChainMeta = { name: "Sepolia", icon: SepoliaIcon, color: "#8B5CF6", accent: "#99f6e4" };

export const CHAIN_META: Record<string, ChainMeta> = {
  // EVM chain IDs
  "42161": arbitrum,
  "43113": avalancheFuji,
  "8453": base,
  "10": optimism,
  "11155111": sepolia,
  // CCIP chain selectors (used by PoolReserveRegistry)
  "4949039107694359620": arbitrum,
  "15971525489660198786": base,
  "3734403246176062136": optimism,
  "16015286601757825753": sepolia,
  "14767482510784806043": avalancheFuji,
};

export function getChainMeta(selector: bigint | string): ChainMeta {
  const key = selector.toString();
  return (
    CHAIN_META[key] ?? {
      name: `Chain ${key}`,
      icon: GenericChainIcon,
      color: "#4B5563",
      accent: "#2dd4bf",
    }
  );
}
