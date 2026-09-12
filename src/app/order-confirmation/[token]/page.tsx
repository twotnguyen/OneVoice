// SPDX-License-Identifier: Apache-2.0
import { confirmationHeaders, createConfirmationService, type ConfirmationPort } from "@/lib/orders/confirmation";
import { readAuthConfig } from "@/lib/auth/config";
import { createSupabaseDataClient } from "@/lib/supabase/server";
import { ConfirmationForm } from "./confirmation-form";
import styles from "./confirmation.module.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  referrer: "no-referrer" as const,
  robots: { index: false, follow: false },
  title: "Xác nhận đơn",
};

function port(): ConfirmationPort {
  const client = createSupabaseDataClient();
  return { rpc: (name, args) => client.rpc(name as never, args as never) };
}

export default async function OrderConfirmationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const origin = readAuthConfig().origin;
  const result = await createConfirmationService(port(), { origin }).read(token);
  return (
    <main className={styles.main}>
      <section className={styles.card} aria-labelledby="confirm-heading">
        <p className={styles.brand}>ONEVOICE</p>
        <h1 id="confirm-heading">Xác nhận đơn hàng</h1>
        {result.ok ? <ConfirmationForm token={token} initial={result.quote} /> : <p role="alert" className={styles.error}>Liên kết không khả dụng.</p>}
      </section>
    </main>
  );
}

export function headers() {
  return confirmationHeaders();
}
