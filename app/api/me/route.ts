import { ok } from "@/lib/api/http";
import { currentUser } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/** Who am I? Used by the header chip so the UI can show the signed-in operator. */
export async function GET() {
  const user = await currentUser();
  return ok({
    user: user
      ? { id: user.id, email: user.email, role: user.role, display_name: user.display_name }
      : null,
  });
}
