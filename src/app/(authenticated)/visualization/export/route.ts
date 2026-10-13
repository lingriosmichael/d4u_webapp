import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/lib/supabase/queries/current-user";
import {
  getExpenseOverview,
  getExpenseOverviewFilterOptions,
  parseExpenseOverviewFilters,
} from "@/lib/supabase/queries/visualization";
import {
  buildExpenseOverviewWorkbook,
  describeExpenseOverviewFilters,
  expenseOverviewFileName,
} from "@/lib/expense-overview-export";
import { canSeeOrganisationOverviews } from "@/lib/overview-access";

// GET /visualization/export?<the Belege-Übersicht's own filter params>
// Downloads exactly the rows the filtered Belege-Übersicht shows, as .xlsx.
// Same query as the page (getExpenseOverview through the signed-in user's
// RLS-scoped Supabase client), so the file can never contain more than the
// user may see; the Accounting/CEO gate is re-checked here rather than
// trusted from the page that rendered the button. Read-only, no backend call.
export async function GET(request: NextRequest) {
  const user = await getCurrentUserProfile();
  if (!user) {
    return NextResponse.json({ error: "Bitte melden Sie sich an." }, { status: 401 });
  }
  if (!canSeeOrganisationOverviews(user.role)) {
    return NextResponse.json(
      { error: "Der Export ist nur für Buchhaltung und Geschäftsführung verfügbar." },
      { status: 403 },
    );
  }

  const params = request.nextUrl.searchParams;
  const filters = parseExpenseOverviewFilters({
    status: params.get("status") ?? undefined,
    responsible: params.get("responsible") ?? undefined,
    costCenter: params.get("costCenter") ?? undefined,
    expenseProject: params.get("expenseProject") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  });

  const [rows, options] = await Promise.all([
    getExpenseOverview(filters),
    getExpenseOverviewFilterOptions(),
  ]);
  const exportedAt = new Date();
  const file = await buildExpenseOverviewWorkbook({
    rows,
    filters: describeExpenseOverviewFilters(filters, options),
    exportedBy: user.name,
    exportedAt,
  });

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${expenseOverviewFileName(exportedAt)}"`,
      "Cache-Control": "no-store",
    },
  });
}
