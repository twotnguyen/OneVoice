// SPDX-License-Identifier: Apache-2.0
'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import type { GapPage } from '@/lib/knowledge/gaps';
import styles from './gaps.module.css';
const labels={price:'Giá',availability:'Tình trạng còn hàng',specification:'Thông số',compatibility:'Khả năng phù hợp / tương thích',policy:'Chính sách',service:'Dịch vụ',program:'Chương trình',delivery:'Giao hàng',warranty:'Bảo hành'};
export function GapManager({initial}:{initial:GapPage}){
 const [data,setData]=useState(initial),[status,setStatus]=useState<'OPEN'|'RESOLVED'>('OPEN'),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const retries=useRef(new Map<string,string>());
 async function load(state=status,page=1){const response=await fetch(`/api/knowledge/gaps?status=${state}&page=${page}`,{cache:'no-store'});if(!response.ok)throw Error('Không tải được danh sách. Kiểm tra phiên đăng nhập và thử lại.');setData(await response.json());setStatus(state);}
 async function run(work:()=>Promise<void>){setBusy(true);setNotice('');try{await work();}catch(error){setNotice((error as Error).message);}finally{setBusy(false);}}
 async function resolve(item:GapPage['items'][number]){
  const key=`${item.id}:${item.version}`;if(!retries.current.has(key))retries.current.set(key,crypto.randomUUID());
  const response=await fetch('/api/knowledge/gaps',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:item.id,expectedVersion:item.version,requestId:retries.current.get(key)})});
  if(!response.ok)throw Error(response.status===409?'Đã có yêu cầu mới hoặc thay đổi ở phiên khác. Tải lại để kiểm tra.':'Chưa lưu được. Thử lại sẽ dùng cùng yêu cầu.');
  retries.current.delete(key);await load();setNotice('Đã đánh dấu bổ sung. Hội thoại vẫn giữ trạng thái hỗ trợ hiện tại.');
 }
 return <section className={styles.page}><header><Link href='/knowledge'>← Chính sách và chương trình</Link><h1>Thông tin cần bổ sung</h1><p>Những mục AI chưa đủ dữ liệu để trả lời. Cập nhật nguồn đúng trước khi đánh dấu đã bổ sung.</p><nav><Link href='/products'>Sản phẩm và giá</Link><Link href='/knowledge/sources'>Tài liệu tư vấn</Link></nav></header>
  <div className={styles.controls}><label>Trạng thái<select value={status} disabled={busy} onChange={e=>void run(()=>load(e.target.value as typeof status))}><option value='OPEN'>Cần bổ sung</option><option value='RESOLVED'>Đã bổ sung</option></select></label><button disabled={busy} onClick={()=>void run(()=>load())}>Tải lại</button></div>
  {notice&&<p role='status'>{notice}</p>}<p>{data.total} mục · Trang {data.page}</p>
  {data.items.length===0&&<p>Không có mục nào trong trạng thái này.</p>}
  <div className={styles.list}>{data.items.map(item=><article key={item.id}><h2>{item.productName??'Thông tin chung của doanh nghiệp'}</h2><p>{labels[item.field]} · {item.reason==='lookup_failed'?'Tra cứu gặp lỗi':'Chưa có thông tin đáng tin cậy'}</p><p>{item.occurrences} lần gặp · Cập nhật {new Date(item.updatedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})} (UTC+7)</p><div className={styles.controls}><Link href={`/support/${item.conversationId}`}>Xem hội thoại gần nhất</Link>{item.productId&&<Link href='/products'>Cập nhật sản phẩm</Link>}{item.status==='OPEN'?<button disabled={busy} onClick={()=>void run(()=>resolve(item))}>Đã cập nhật nguồn thông tin</button>:<span>Đã bổ sung · {item.resolvedAt&&new Date(item.resolvedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</span>}</div></article>)}</div>
  <div className={styles.controls}><button disabled={busy||data.page<=1} onClick={()=>void run(()=>load(status,data.page-1))}>Trước</button><button disabled={busy||data.page*20>=data.total} onClick={()=>void run(()=>load(status,data.page+1))}>Sau</button></div>
 </section>;
}
