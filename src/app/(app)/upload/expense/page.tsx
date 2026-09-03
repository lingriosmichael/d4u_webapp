import type { Metadata } from "next";
import { StandardExpenseForm } from "./expense-form";

export const metadata: Metadata = {
  title: "Standardbeleg einreichen — D4U Finance",
};

export default function UploadExpensePage() {
  return <StandardExpenseForm />;
}
