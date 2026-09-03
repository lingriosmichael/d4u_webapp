import type { Metadata } from "next";
import { AdminPage } from "./admin-view";

export const metadata: Metadata = {
  title: "Administration — D4U Finance",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminPage />;
}
