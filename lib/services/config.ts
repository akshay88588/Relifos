import { admin } from "@/lib/supabase/admin";

export async function getConfig<T>(key: string, fallback: T): Promise<T> {
  const { data } = await admin().from("app_config").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? fallback;
}

export async function setConfig(key: string, value: unknown) {
  await admin().from("app_config")
    .upsert({ key, value: value as any, updated_at: new Date().toISOString() });
}

export const autoDispatchEnabled = () => process.env.AUTO_DISPATCH_ENABLED === "true";
