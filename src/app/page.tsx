import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

// Where this lands depends on who is asking, so it cannot be prerendered.
export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  redirect(session ? "/dashboard" : "/sign-in");
}
