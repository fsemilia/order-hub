"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { logger } from "@/lib/logger";
import { requireUser } from "@/lib/session";
import { STORE_COOKIE } from "@/lib/stores/current";
import { CURRENCIES, normalizeShopDomain } from "@/lib/stores/domain";
import {
  createShopifyStore,
  deleteShopifyStore,
  rotateWebhookSecret,
} from "@/lib/stores/stores";

export type StoreFormState =
  | null
  | { ok: true; message: string }
  | { ok: false; message: string; fields?: Partial<Record<"name" | "domain" | "secret", true>> };

async function messages(formData: FormData) {
  const sent = formData.get("locale");
  return getDictionary(isLocale(sent) ? sent : await getRequestLocale()).stores;
}

const secretSchema = z.string().trim().min(16).max(256);

export async function addStore(_prev: StoreFormState, formData: FormData): Promise<StoreFormState> {
  const user = await requireUser();
  const m = await messages(formData);

  const parsed = z
    .object({
      name: z.string().trim().min(1).max(80),
      domain: z.string().trim().min(1).max(255),
      currency: z.enum(CURRENCIES),
      secret: secretSchema,
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fields = Object.fromEntries(
      parsed.error.issues.map((i) => [String(i.path[0]), true as const]),
    );
    return { ok: false, message: m.errors.invalid, fields };
  }
  const shopDomain = normalizeShopDomain(parsed.data.domain);
  if (!shopDomain) return { ok: false, message: m.errors.invalidDomain, fields: { domain: true } };

  try {
    const store = await createShopifyStore({
      name: parsed.data.name,
      shopDomain,
      currency: parsed.data.currency,
      webhookSecret: parsed.data.secret,
    });
    // The new store becomes the current one: the next step is watching its data arrive.
    (await cookies()).set(STORE_COOKIE, store.id, { path: "/", sameSite: "lax", httpOnly: true });
    logger.info("store.created", { storeId: store.id, shopDomain, by: user.id });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, message: m.errors.duplicateDomain, fields: { domain: true } };
    }
    throw e;
  }
  revalidatePath("/stores");
  return { ok: true, message: m.added };
}

export async function rotateSecret(_prev: StoreFormState, formData: FormData): Promise<StoreFormState> {
  const user = await requireUser();
  const m = await messages(formData);
  const storeId = z.string().min(1).max(64).safeParse(formData.get("storeId"));
  const secret = secretSchema.safeParse(formData.get("secret"));
  if (!storeId.success || !secret.success) {
    return { ok: false, message: m.errors.invalid, fields: { secret: true } };
  }
  if (!(await rotateWebhookSecret(storeId.data, secret.data))) {
    return { ok: false, message: m.errors.invalid };
  }
  logger.info("store.secret_rotated", { storeId: storeId.data, by: user.id });
  return { ok: true, message: m.rotated };
}

export async function removeStore(formData: FormData) {
  const user = await requireUser();
  const storeId = z.string().min(1).max(64).parse(formData.get("storeId"));
  const { count } = await deleteShopifyStore(storeId);
  if (count) logger.info("store.deleted", { storeId, by: user.id });
  const jar = await cookies();
  if (jar.get(STORE_COOKIE)?.value === storeId) jar.delete(STORE_COOKIE);
  revalidatePath("/stores");
}
