import Link from "next/link";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";

export default function ExpenseNotFound() {
  return (
    <PageContainer>
      <PageHeader
        title="Beleg nicht gefunden"
        description="Der angeforderte Beleg existiert nicht oder wurde gelöscht."
      />
      <Link href="/" className="text-ember text-sm underline">
        Zurück zur Übersicht
      </Link>
    </PageContainer>
  );
}
