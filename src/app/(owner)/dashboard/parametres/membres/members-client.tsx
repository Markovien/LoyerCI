"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { addMember, changeMemberRole, removeMember, type MemberResult } from "./actions";

type Role = "owner" | "manager" | "accountant";
const ROLES: { value: Role; label: string }[] = [
  { value: "owner", label: "Propriétaire" },
  { value: "manager", label: "Gestionnaire" },
  { value: "accountant", label: "Comptable" },
];
const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");
const SELECT = "h-10 w-full min-w-0 rounded-md border bg-card px-2 text-sm";

function Status({ msg }: { msg: MemberResult | null }) {
  if (!msg) return null;
  return (
    <p role="status" className={cn("rounded-md p-2 text-sm", msg.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
      {msg.message}
    </p>
  );
}

export function MemberRow(props: { orgId: string; userId: string; name: string; role: Role; since: string; isMe: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<MemberResult | null>(null);
  const [role, setRole] = useState<Role>(props.role);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<MemberResult>, onFail?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r.ok) router.refresh();
      else onFail?.();
    });
  return (
    <li className="grid gap-2 py-3" data-testid="member-row">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">
            {props.name}
            {props.isMe && <span className="ml-1 text-xs text-muted-foreground">(vous)</span>}
          </p>
          <p className="text-xs text-muted-foreground">Depuis le {props.since}</p>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <select
            aria-label={`Rôle de ${props.name}`}
            className={cn(SELECT, "w-40")}
            value={role}
            disabled={pending}
            onChange={(e) => {
              const next = ROLES.find((r) => r.value === e.target.value)?.value ?? role;
              setRole(next);
              // Refus (ex. dernier propriétaire) : la liste revient au rôle réel.
              run(
                () => changeMemberRole({ orgId: props.orgId, userId: props.userId, role: next }),
                () => setRole(role),
              );
            }}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            aria-label={`Retirer ${props.name}`}
            onClick={() => {
              if (!window.confirm(`Retirer ${props.name} ? Son accès est coupé immédiatement.`)) return;
              run(() => removeMember({ orgId: props.orgId, userId: props.userId }));
            }}
          >
            <UserMinus />
          </Button>
        </div>
      </div>
      <Status msg={msg} />
    </li>
  );
}

export function AddMemberForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<MemberResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      aria-label="Ajouter un membre"
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        const input = { orgId, fullName: text(f.get("fullName")), email: text(f.get("email")), role: text(f.get("role")) };
        start(async () => {
          const r = await addMember(input);
          setMsg(r);
          if (r.ok) {
            form.reset();
            router.refresh();
          }
        });
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="member-name">Nom et prénoms</Label>
        <Input id="member-name" name="fullName" required minLength={2} maxLength={120} placeholder="ex. Bamba Awa" />
      </div>
      <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
        <div className="grid gap-1.5">
          <Label htmlFor="member-email">E-mail</Label>
          <Input id="member-email" name="email" type="email" required maxLength={200} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="member-role">Rôle</Label>
          <select id="member-role" name="role" defaultValue="manager" className={SELECT}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Button type="submit" disabled={pending} className="justify-self-start">
        <UserPlus />
        {pending ? "Ajout…" : "Ajouter le membre"}
      </Button>
      <Status msg={msg} />
    </form>
  );
}
