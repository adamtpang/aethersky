"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";

const LINKS = [
  { href: "/", label: "Map" },
  { href: "/about", label: "About" },
] as const;

/**
 * The site's nav bar. It sits directly under the disclaimer on every page,
 * so the story of what this is and is not is always one click away.
 */
export default function NavBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="z-[1090] flex shrink-0 items-center gap-3 border-b border-line bg-panel px-3 py-2 sm:px-4"
    >
      <Link href="/" className="flex min-w-0 items-center gap-2">
        <Logo size={26} />
        <span className="text-[15px] font-semibold tracking-tight text-fg">
          aethersky
        </span>
        <span className="hidden truncate text-[11px] text-muted sm:inline">
          Advisory demo
        </span>
      </Link>
      <ul className="ml-auto flex items-center gap-1 text-[13px]">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`block px-2.5 py-1 ${
                  active
                    ? "border-b-2 border-accent text-fg"
                    : "border-b-2 border-transparent text-muted hover:text-fg"
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
        <li>
          <a
            href="https://github.com/adamtpang/aethersky"
            target="_blank"
            rel="noreferrer"
            className="block border-b-2 border-transparent px-2.5 py-1 text-muted hover:text-fg"
          >
            GitHub
          </a>
        </li>
      </ul>
    </nav>
  );
}
