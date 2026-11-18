import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold tracking-tight">
      <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <svg
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5.5 10v9.5h13V10" />
          <path d="m9.5 15 2 2 3.5-4" />
        </svg>
      </span>
      <span>
        Loyer<span className="text-accent">CI</span>
      </span>
    </Link>
  );
}
