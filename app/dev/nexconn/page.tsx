import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { NexconnLab } from "@/features/nexconn/dev/nexconn-lab";
import { devRoutesEnabled } from "@/features/nexconn/server";

export const instant = false;

export const metadata: Metadata = {
  title: "Nexconn lab",
  robots: { index: false, follow: false },
};

export default async function NexconnLabPage() {
  await connection();
  if (!devRoutesEnabled()) notFound();
  return <NexconnLab />;
}
