// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { requirePagePermission } from "@/lib/auth/guards";
import { createSupabaseDataClient } from "@/lib/supabase/server";
import { createSupportReader, supportQuery } from "@/lib/conversations/support/read";
import { QueueRefresh } from "./queue-refresh";
import styles from "./support.module.css";
export const dynamic="force-dynamic";
const reasons:Record<string,string>={return_request:"Yêu cầu đổi trả",warranty_request:"Yêu cầu bảo hành",customer_requested:"Khách cần nhân viên",missing_evidence:"Thiếu thông tin xác thực",lookup_failed:"Tra cứu chưa thành công"};
export default async function SupportPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const actor=await requirePagePermission("read_operations","/support");
 const query=supportQuery.safeParse(await searchParams);
 if(!query.success)return <section className={styles.page}><h1>Yêu cầu hỗ trợ</h1><p>Bộ lọc không hợp lệ.</p><Link href="/support">Xóa bộ lọc</Link></section>;
 let result;try{result=await createSupportReader(createSupabaseDataClient()).queue(actor.organizationId,query.data);}catch{return <section className={styles.page}><h1>Yêu cầu hỗ trợ</h1><p>Chưa thể tải hàng chờ. Vui lòng tải lại.</p><Link href="/support">Thử lại</Link></section>;}
 const next=new URLSearchParams({status:query.data.status});if(result.nextCursor)next.set("cursor",result.nextCursor);
 return <section className={styles.page}><header className={styles.header}><div><p className={styles.eyebrow}>CHĂM SÓC KHÁCH HÀNG</p><h1>Yêu cầu hỗ trợ</h1><p>Nhận việc tại đây, trả lời trong hộp thư Meta. Yêu cầu được giữ cho đến khi hoàn tất.</p></div><div><Link href="/warranty">Theo dõi bảo hành →</Link><p><Link href="/knowledge/sources">Tài liệu tư vấn →</Link></p><p><QueueRefresh/></p></div></header>
 <div className={styles.counts}><article><strong>{result.counts.waiting+result.counts.active}</strong><span>Chưa hoàn tất</span></article><article><strong>{result.counts.waiting}</strong><span>Đang chờ nhân viên</span></article><article><strong>{result.counts.active}</strong><span>Đang được xử lý</span></article></div>
 <nav className={styles.filters} aria-label="Lọc yêu cầu">{[["all","Tất cả"],["WAITING_STAFF","Chờ nhận"],["STAFF_ACTIVE","Đang xử lý"]].map(([value,label])=><Link key={value} href={`/support?status=${value}`} aria-current={query.data.status===value?"page":undefined}>{label}</Link>)}</nav>
 <div className={styles.list}>{result.events.length===0?<div className={styles.empty}><h2>Không có yêu cầu trong bộ lọc này</h2><p>Tin nhắn mới và yêu cầu chưa xong sẽ xuất hiện tại đây.</p></div>:result.events.map(item=><Link className={styles.ticket} key={item.id} href={`/support/${item.conversationId}`}><div><span className={styles.badge}>{item.status==="WAITING_STAFF"?"Chờ nhận":"Đang xử lý"}</span><h2>{reasons[item.reason]??"Yêu cầu hỗ trợ"}</h2><p>Khách {item.psid} · Page {item.pageId}</p><small>{item.claimedBy?`Người nhận: ${item.claimedBy}`:"Chưa có người nhận"}</small></div><div className={styles.ticketMeta}><time dateTime={item.requestedAt}>{new Date(item.requestedAt).toLocaleString("vi-VN",{timeZone:"UTC"})} UTC</time><strong>Xem hội thoại →</strong></div></Link>)}</div>
 {result.nextCursor&&<Link className={styles.next} href={`/support?${next}`}>Trang tiếp theo →</Link>}
 </section>;
}
