"use client";

import { createClient } from "./client";

// Uploads a receipt file to the private `receipts` Storage bucket and
// returns the storage path to use as an expense's `document_ref`. This is
// a direct client-side Storage write (not a table write), so it doesn't
// fall under this frontend's "never write business-critical data directly
// to Supabase" rule — that rule covers expenses/budget_lines/
// expense_accounting_details/approval_logs/admin_audit_log, not file
// storage. Verified against the live bucket (2026-09-03): uploads from an
// authenticated session succeed.
//
// Path follows the spec's suggested shape (receipts/<project_code>/
// <id>/<filename>) but uses a client-generated id rather than the
// expense's real id, since the expense doesn't exist yet at upload time —
// the expense row's own `document_ref` column is the authoritative link
// regardless of the exact path convention.
export async function uploadReceipt(file: File, projectCode: string): Promise<string> {
  const supabase = createClient();
  const safeName = file.name.replace(/[^\w.-]/g, "_");
  const path = `${projectCode}/${crypto.randomUUID()}/${safeName}`;

  const { error } = await supabase.storage.from("receipts").upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw error;

  return path;
}
