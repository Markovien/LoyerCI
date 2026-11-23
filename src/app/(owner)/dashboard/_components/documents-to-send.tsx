"use client";
import { useState, useTransition } from "react";
import { Check, Download, FileText, Mail, MessageCircle, Send, Share2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { markDocumentSent, prepareDocument } from "../actions";

type Channel = "partage" | "whatsapp" | "email" | "sms" | "telechargement";

export interface DocumentItem {
  invoiceId: string;
  docType: "avis" | "quittance";
  tenantName: string;
  label: string; // ex. « Avis de décembre 2026 », « Quittance AKW-2026-000007 »
  sent: { channel: Channel; sentAt: string }[];
}

const CHANNEL_LABEL: Record<Channel, string> = {
  partage: "partagé",
  whatsapp: "WhatsApp",
  email: "e-mail",
  sms: "SMS",
  telechargement: "téléchargé",
};

/**
 * D.2 — File « Documents à envoyer » : le bailleur envoie depuis SES comptes, en un geste.
 * Les navigateurs exigent un geste de l'utilisateur pour partager ou ouvrir WhatsApp :
 * on prépare d'abord (PDF + message), puis chaque bouton agit immédiatement.
 */
export function DocumentsToSend({ items, periodLabel }: { items: DocumentItem[]; periodLabel: string }) {
  if (items.length === 0) return null;
  const todo = items.filter((i) => i.sent.length === 0);
  const done = items.filter((i) => i.sent.length > 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Documents à envoyer — {periodLabel} ({todo.length})
        </CardTitle>
        <CardDescription>
          Envoyez depuis votre téléphone ou votre messagerie. Chaque document porte un code de vérification ; le message ne contient jamais
          de numéro de paiement.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {todo.length === 0 && <p className="text-sm text-success">Tous les documents du mois ont été envoyés.</p>}
        {todo.map((i) => (
          <DocumentRow key={`${i.invoiceId}-${i.docType}`} item={i} />
        ))}
        {done.length > 0 && (
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Déjà envoyés ({done.length})</summary>
            <div className="mt-3 grid gap-3">
              {done.map((i) => (
                <DocumentRow key={`${i.invoiceId}-${i.docType}`} item={i} />
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

type Prepared = {
  file: File | null;
  text: string;
  pdfPath: string;
  fileName: string;
  whatsappUrl: string | null;
  mailtoUrl: string | null;
};

function DocumentRow({ item }: { item: DocumentItem }) {
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [sent, setSent] = useState(item.sent);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const canShareFile = !!prepared?.file && typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [prepared.file] });

  const record = (channel: Channel) => {
    setSent((s) => [...s, { channel, sentAt: new Date().toISOString() }]);
    start(async () => {
      const r = await markDocumentSent({ invoiceId: item.invoiceId, docType: item.docType, channel });
      if (!r.ok) setError(r.message);
    });
  };

  const prepare = () =>
    start(async () => {
      setError(null);
      const r = await prepareDocument({ invoiceId: item.invoiceId, docType: item.docType });
      if (!r.ok) return setError(r.message);
      let file: File | null = null;
      try {
        const res = await fetch(r.pdfPath, { credentials: "same-origin", cache: "no-store" });
        if (res.ok) file = new File([await res.blob()], r.fileName, { type: "application/pdf" });
      } catch {
        file = null; // le partage avec pièce jointe sera simplement indisponible
      }
      setPrepared({ file, text: r.text, pdfPath: r.pdfPath, fileName: r.fileName, whatsappUrl: r.whatsappUrl, mailtoUrl: r.mailtoUrl });
    });

  const share = () => {
    if (!prepared?.file) return;
    // Appel direct dans le geste de l'utilisateur (exigence des navigateurs).
    navigator.share({ files: [prepared.file], text: prepared.text, title: prepared.fileName }).then(
      () => record("partage"),
      (e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError"))
          setError("Partage impossible sur cet appareil : utilisez WhatsApp ou le téléchargement.");
      },
    );
  };

  return (
    <div data-testid="document-to-send" className="rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-medium">
            <FileText className="size-4 text-muted-foreground" aria-hidden />
            {item.tenantName}
          </p>
          <p className="text-xs text-muted-foreground">{item.label}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {sent.map((s, k) => (
            <Badge key={k} className="bg-success/15 text-success">
              <Check className="size-3" aria-hidden />
              {CHANNEL_LABEL[s.channel]} · {formatDate(s.sentAt)}
            </Badge>
          ))}
        </div>
      </div>

      {!prepared ? (
        <Button size="sm" variant="outline" className="mt-2" onClick={prepare} disabled={pending}>
          <Send />
          {pending ? "Préparation…" : sent.length ? "Renvoyer" : "Préparer l'envoi"}
        </Button>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {canShareFile && (
            <Button size="sm" onClick={share}>
              <Share2 />
              Partager le PDF
            </Button>
          )}
          {prepared.whatsappUrl && (
            <Button asChild size="sm" variant="whatsapp">
              <a href={prepared.whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={() => record("whatsapp")}>
                <MessageCircle />
                WhatsApp
              </a>
            </Button>
          )}
          {prepared.mailtoUrl && (
            <Button asChild size="sm" variant="outline">
              <a href={prepared.mailtoUrl} onClick={() => record("email")}>
                <Mail />
                E-mail
              </a>
            </Button>
          )}
          <Button asChild size="sm" variant="ghost">
            <a href={prepared.pdfPath} download={prepared.fileName} onClick={() => record("telechargement")}>
              <Download />
              Télécharger le PDF
            </a>
          </Button>
        </div>
      )}
      {prepared && !canShareFile && (
        <p className="mt-1 text-xs text-muted-foreground">
          Sur ordinateur : téléchargez le PDF puis joignez-le au message WhatsApp ou à l&apos;e-mail.
        </p>
      )}
      {error && (
        <p role="alert" className={cn("mt-2 text-xs text-danger")}>
          {error}
        </p>
      )}
    </div>
  );
}
