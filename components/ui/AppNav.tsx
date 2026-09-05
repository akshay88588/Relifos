"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { GridIcon, MegaphoneIcon, TruckIcon } from "./bits";

const WORKSPACES = [
  { href: "/command", label: "Command", icon: GridIcon, hint: "Coordinator console — approve and dispatch" },
  { href: "/responder", label: "Responder", icon: TruckIcon, hint: "Field console — your unit and its assignment" },
  { href: "/report", label: "Report", icon: MegaphoneIcon, hint: "Citizen intake — report an emergency" },
];

/**
 * WORKSPACE SWITCHER.
 *
 * ReliefOS is three consoles for three roles, and each one used to be a dead
 * end: the only route from the responder console to the command centre was the
 * logo, the landing page, and then a link. Someone who arrives on the wrong
 * screen - which is most people, since sign-in used to land everyone on
 * /command - should be one tap from the right one, on a phone, without signing
 * out. Icons only on narrow screens so it survives a crowded console header.
 */
export function AppNav({ className }: { className?: string }) {
  const path = usePathname();
  return (
    <nav
      aria-label="Workspaces"
      // The nav is the flexible element in a crowded header: it scrolls rather
      // than pushing the connection pill and user chip off a 390px screen.
      className={clsx("flex items-center gap-0.5 rounded-md p-0.5 min-w-0 overflow-x-auto scroll-x-bare", className)}
      style={{ background: "var(--surface-hover)" }}
    >
      {WORKSPACES.map((w) => {
        const active = path === w.href || path.startsWith(`${w.href}/`);
        const Icon = w.icon;
        return (
          <Link
            key={w.href}
            href={w.href}
            title={w.hint}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "flex items-center gap-1.5 rounded px-1.5 sm:px-2 py-1 text-[11px] font-medium shrink-0",
              "whitespace-nowrap transition-colors min-h-[28px]",
              active ? "text-ink-primary" : "text-ink-tertiary hover:text-ink-secondary",
            )}
            style={active ? { background: "var(--surface-active)", boxShadow: "inset 0 0 0 1px var(--border-default)" } : undefined}
          >
            <Icon size={13} />
            {/* Three unlabelled icons on a phone are a guessing game. The one you
                are on keeps its label so the row still says where you are; the
                other two shrink to icons so the header survives a 390px screen. */}
            <span className={active ? "inline" : "hidden sm:inline"}>{w.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
