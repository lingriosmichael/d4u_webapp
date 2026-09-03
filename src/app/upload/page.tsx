import type { Metadata } from "next";
import { UploadTypeSelector } from "./upload-view";

export const metadata: Metadata = {
  title: "Beleg-Upload — D4U Finance",
  description: "Standardbeleg oder Partner-Vorschuss einreichen.",
};

export default function UploadPage() {
  return <UploadTypeSelector />;
}
