import { connection } from "next/server";
import { PlannerApp } from "@/components/PlannerApp";
import { activeProvider, PROVIDER_LABEL } from "@/lib/ai/provider-config";

export default async function Home() {
  // Render per request so the AI status reflects the server's runtime config.
  await connection();
  const provider = activeProvider();
  return <PlannerApp aiProvider={provider && PROVIDER_LABEL[provider]} />;
}
