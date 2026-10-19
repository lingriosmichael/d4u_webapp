import { beforeEach, describe, expect, it, vi } from "vitest";

// Receipts go into the private `receipts` bucket at
// "<project code>/<uuid>/<file name>". The shape is load-bearing: the
// bucket's RLS policies read the project from the first folder
// (d4u_backend migration 0035), and the backend accepts a correction's
// document only in exactly this shape (d4u_backend
// src/lib/expense-correction.ts, isDocumentInProjectFolder — mirrored
// below). The file types offered are limited by the forms' `accept`
// attribute; uploadReceipt itself checks neither type nor size.

const storage = vi.hoisted(() => ({
  upload: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: storage.from } }),
}));

const { uploadReceipt } = await import("@/lib/supabase/upload-receipt");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The backend's check, so a path uploadReceipt writes is one it accepts. */
function backendAcceptsPath(documentRef: string, projectCode: string) {
  const [folder, id, fileName, ...rest] = documentRef.split("/");
  return (
    rest.length === 0 &&
    folder === projectCode &&
    UUID.test(id ?? "") &&
    !!fileName &&
    fileName !== "." &&
    fileName !== ".."
  );
}

function receipt(name: string, type = "application/pdf") {
  return new File(["%PDF-1.7"], name, { type });
}

beforeEach(() => {
  storage.upload.mockReset();
  storage.upload.mockResolvedValue({ data: { path: "ignored" }, error: null });
  storage.from.mockReset();
  storage.from.mockReturnValue({ upload: storage.upload });
});

describe("uploadReceipt", () => {
  it("uploads into the receipts bucket under <project code>/<uuid>/<file name>", async () => {
    const file = receipt("Rechnung-2026-10.pdf");

    const path = await uploadReceipt(file, "BIB-24");

    expect(storage.from).toHaveBeenCalledWith("receipts");
    const [folder, id, fileName] = path.split("/");
    expect(folder).toBe("BIB-24");
    expect(id).toMatch(UUID);
    expect(fileName).toBe("Rechnung-2026-10.pdf");
    expect(backendAcceptsPath(path, "BIB-24")).toBe(true);
    expect(storage.upload).toHaveBeenCalledWith(path, file, {
      contentType: "application/pdf",
      upsert: false,
    });
  });

  it("returns the path it uploaded to, for document_ref", async () => {
    const path = await uploadReceipt(receipt("beleg.png", "image/png"), "BIB-24");
    expect(storage.upload.mock.calls[0][0]).toBe(path);
  });

  it("never overwrites: the same file name twice lands in two folders", async () => {
    const first = await uploadReceipt(receipt("beleg.pdf"), "BIB-24");
    const second = await uploadReceipt(receipt("beleg.pdf"), "BIB-24");
    expect(first).not.toBe(second);
    expect(storage.upload.mock.calls.every(([, , options]) => options.upsert === false)).toBe(true);
  });

  it.each([
    ["Rechnung März 2026.pdf", "Rechnung_M_rz_2026.pdf"],
    ["../../ABC-1/x/evil.pdf", ".._.._ABC-1_x_evil.pdf"],
    ["a\\b.pdf", "a_b.pdf"],
    ["quittung (1).jpg", "quittung__1_.jpg"],
  ])("makes the file name one safe path segment: %j -> %j", async (name, expected) => {
    const path = await uploadReceipt(receipt(name), "BIB-24");
    expect(path.split("/")).toHaveLength(3);
    expect(path.split("/")[2]).toBe(expected);
    expect(backendAcceptsPath(path, "BIB-24")).toBe(true);
  });

  it("leaves the content type to Storage when the browser reports none", async () => {
    await uploadReceipt(receipt("beleg", ""), "BIB-24");
    expect(storage.upload.mock.calls[0][2]).toEqual({ contentType: undefined, upsert: false });
  });

  it("throws Storage's error instead of returning a path that holds no file", async () => {
    const storageError = new Error("new row violates row-level security policy");
    storage.upload.mockResolvedValue({ data: null, error: storageError });

    await expect(uploadReceipt(receipt("beleg.pdf"), "ABC-1")).rejects.toBe(storageError);
  });
});
