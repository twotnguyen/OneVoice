// SPDX-License-Identifier: Apache-2.0
import { requirePagePermission } from "@/lib/auth/guards";
import { asOperationsPort, createOrderOperationsRepository } from "@/lib/orders/operations";
import { createSupabaseDataClient } from "@/lib/supabase/server";
import { OrdersManager } from "./orders-manager";
import styles from "./orders.module.css";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const actor = await requirePagePermission("read_operations", "/orders");
  const repo = createOrderOperationsRepository(asOperationsPort(createSupabaseDataClient()), actor);
  let initial;
  let exceptions;
  try {
    initial = await repo.list({ status: "PREPARING", page: 1 });
    exceptions = actor.role === "manager" ? await repo.exceptions() : [];
  } catch {
    return (
      <section className={styles.page}>
        <h1>Đơn hàng</h1>
        <p>Chưa thể tải danh sách. Vui lòng tải lại.</p>
      </section>
    );
  }
  return <OrdersManager initial={initial} role={actor.role} exceptions={exceptions} />;
}
