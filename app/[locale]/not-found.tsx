import Link from "next/link";
import { buttonStyles } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";

export default async function NotFound() {
  const { dict } = await getI18n();
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-sm font-semibold text-indigo-600">404</p>
      <h1 className="text-2xl font-semibold">{dict.errors.notFound}</h1>
      <Link href="/" className={buttonStyles.secondary}>
        {dict.errors.backHome}
      </Link>
    </main>
  );
}
