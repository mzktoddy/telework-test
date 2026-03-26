import { cache } from "react";
import { redirect } from "next/navigation";
import { getSession } from "./session";
import { getDb } from "@/db";
import { users } from "@/db/schema/users";
import { eq } from "drizzle-orm";

export type SessionData = {
  userId: string;
  role: string;
};

export const verifySession = cache(async (): Promise<SessionData> => {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return {
    userId: session.sub,
    role: session.role,
  };
});

export async function getCurrentUser() {
  const { userId } = await verifySession();
  const db = await getDb();

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    redirect("/login");
  }

  return user;
}
