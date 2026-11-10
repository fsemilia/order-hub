import { notFound } from "next/navigation";

// Unknown paths render the localized not-found page of the [locale] root layout.
export default function CatchAll() {
  notFound();
}
