"use client";

import Link from "next/link";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { FileText, HandCoins, ArrowRight } from "lucide-react";

export function UploadTypeSelector() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Neuer Beleg"
        title="Welche Art von Beleg möchten Sie einreichen?"
        description="Die beiden Formulare unterscheiden sich in ihrem Ablauf. Wählen Sie sorgfältig — ein Wechsel ist später nicht möglich."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          href="/upload/expense"
          className="group bg-card ring-1 ring-black/5 rounded-xl p-8 hover:ring-navy-600/40 transition-all"
        >
          <div className="size-12 bg-navy-100 rounded-lg grid place-items-center text-navy-900 mb-5">
            <FileText className="size-5" strokeWidth={2} />
          </div>
          <h3 className="font-heading font-semibold text-lg text-foreground">Standardbeleg</h3>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Einzelne Rechnungen, Quittungen oder Reisekosten. Wird nach Einreichung geprüft — je
            nach Betrag durchläuft der Beleg eine oder mehrere Freigabestufen.
          </p>
          <div className="mt-6 flex items-center gap-1.5 text-sm font-medium text-navy-800 group-hover:gap-2.5 transition-all">
            Standardbeleg einreichen
            <ArrowRight className="size-4" />
          </div>
        </Link>

        <Link
          href="/upload/advance"
          className="group bg-card ring-1 ring-black/5 rounded-xl p-8 hover:ring-navy-600/40 transition-all"
        >
          <div className="size-12 bg-navy-100 rounded-lg grid place-items-center text-navy-900 mb-5">
            <HandCoins className="size-5" strokeWidth={2} />
          </div>
          <h3 className="font-heading font-semibold text-lg text-foreground">Partner-Vorschuss</h3>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Mittelabruf für einen Projektpartner. Wird sofort zur Auszahlung freigegeben und später
            durch die Buchhaltung abgerechnet.
          </p>
          <div className="mt-6 flex items-center gap-1.5 text-sm font-medium text-navy-800 group-hover:gap-2.5 transition-all">
            Vorschuss anlegen
            <ArrowRight className="size-4" />
          </div>
        </Link>
      </div>
    </PageContainer>
  );
}
