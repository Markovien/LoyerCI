"use client";
import { useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Valeur copiable en un tap ; tout le bloc est la cible tactile (mobile d'abord). */
export function CopyField({ label, value, display, emphasize }: { label: string; value: string; display?: string; emphasize?: boolean }) {
  const [copied, setCopied] = useState<"ok" | "ko" | null>(null);
  const copy = () => {
    // Le presse-papier peut être refusé (contexte non sécurisé, permission) : on le signale.
    navigator.clipboard
      .writeText(value)
      .then(
        () => setCopied("ok"),
        () => setCopied("ko"),
      )
      .finally(() => setTimeout(() => setCopied(null), 1500));
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copier ${label}`}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition active:scale-[0.99]",
        emphasize && "border-accent bg-accent/8",
      )}
    >
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className={cn("block break-words font-mono text-[13px] sm:text-sm", emphasize && "text-base font-semibold")}>
          {display ?? value}
        </span>
      </span>
      <span aria-live="polite" className="shrink-0">
        {copied === "ok" ? (
          <Check className="size-5 text-success" aria-label="Copié" />
        ) : copied === "ko" ? (
          <X className="size-5 text-danger" aria-label="Copie impossible" />
        ) : (
          <Copy className="size-5 text-muted-foreground" aria-hidden />
        )}
      </span>
    </button>
  );
}
