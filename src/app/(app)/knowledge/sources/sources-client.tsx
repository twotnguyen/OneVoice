// SPDX-License-Identifier: Apache-2.0
'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { defaultSource, type SourceDocument, type SourcePage, type SourceRecord } from '@/lib/knowledge/sources';
import styles from './sources.module.css';
import { IngestionStatusPanel } from './ingestion-status';

type Editor = SourceRecord & { productNames: Record<string, string> };
export function SourcesClient({ initial, canManage }: { initial: SourcePage; canManage: boolean }) {
  const [list, setList] = useState(initial);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Array<{ id: string; name: string }>>([]);
  const [productError, setProductError] = useState('');
  const retry = useRef<{ body: string; requestId: string } | null>(null);
  const editorId = editor?.id;
  useEffect(() => {
    if (!canManage || !editorId) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setProductError('');
      fetch('/api/products/manage?pageSize=50&search=' + encodeURIComponent(search), { signal: controller.signal }).then(async response => {
        if (!response.ok) throw Error();
        const result = await response.json();
        if (!controller.signal.aborted) setProducts(result.items);
      }).catch(() => { if (!controller.signal.aborted) { setProducts([]); setProductError('Không tải được danh sách sản phẩm.'); } });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [canManage, editorId, search]);
  const update = (change: Partial<SourceDocument>) => setEditor(value => value ? { ...value, document: { ...value.document, ...change } } : null);
  async function loadPage(page: number) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/knowledge/sources?page=' + page);
      if (!response.ok) throw Error();
      setList(await response.json());
    } catch { setMessage('Không tải được nguồn tri thức. Thử lại sau.'); }
    finally { setBusy(false); }
  }
  async function open(id: string) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/knowledge/sources?id=' + encodeURIComponent(id));
      if (!response.ok) throw Error();
      setEditor(await response.json()); retry.current = null;
    } catch { setMessage('Không mở được nguồn. Nội dung đang nhập vẫn được giữ.'); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor || !canManage || busy) return;
    setBusy(true); setMessage('');
    const document = { ...editor.document, topics: editor.document.topics.map(topic => topic.trim()).filter(Boolean) };
    const base = { id: editor.id, expectedVersion: editor.version, document };
    const body = JSON.stringify(base);
    if (retry.current?.body !== body) retry.current = { body, requestId: crypto.randomUUID() };
    try {
      const response = await fetch('/api/knowledge/sources', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...base, requestId: retry.current.requestId }) });
      if (response.status === 409) { setMessage('Nguồn đã có phiên bản mới. Nội dung bạn nhập được giữ; tải lại bản đã lưu trước khi sửa tiếp.'); return; }
      if (!response.ok) { const error = await response.json(); setMessage(error.message || 'Không lưu được. Kiểm tra dữ liệu và quyền truy cập.'); return; }
      const saved = await response.json();
      setEditor({ ...editor, version: saved.version, document }); retry.current = null;
      setMessage(`Đã lưu phiên bản ${saved.version}.`);
      const refreshed = await fetch('/api/knowledge/sources?page=' + list.page);
      if (refreshed.ok) setList(await refreshed.json());
    } catch { setMessage('Kết nối bị gián đoạn. Bấm Lưu để thử lại cùng yêu cầu.'); }
    finally { setBusy(false); }
  }
  return <section className={styles.page}>
    <header><h1>Nguồn tri thức</h1><p>Bổ sung hướng dẫn, tài liệu sản phẩm và thông tin doanh nghiệp cho việc tư vấn.</p>{canManage && <p><a href="/knowledge">Chính sách và chương trình →</a></p>}</header>
    <p className={styles.notice}>Nguồn được lưu theo phiên bản. Nội dung chỉ được dùng sau khi nạp hợp lệ và còn thời hạn cập nhật; giá, tồn kho và tình trạng đơn lấy từ dữ liệu vận hành.</p>
    {!canManage && <p>Bạn có quyền xem. Người quản lý có thể thêm hoặc sửa nguồn.</p>}
    {message && <p role="status" className={styles.notice}>{message}</p>}
    {canManage && <button disabled={busy} onClick={() => { setEditor({ id: crypto.randomUUID(), version: 0, document: defaultSource(), updatedAt: '', productNames: {} }); setMessage(''); retry.current = null; }}>Thêm nguồn</button>}
    <div className={styles.columns}>
      <section aria-label="Danh sách nguồn" className={styles.card}>
        <p>{list.total} nguồn · Trang {list.page}</p>
        {list.items.length === 0 && <p>Chưa có nguồn tri thức.</p>}
        {list.items.map(source => <button key={source.id} className={styles.source} disabled={busy} onClick={() => open(source.id)}><strong>{source.document.name}</strong><span>{source.document.kind === 'text' ? 'Văn bản' : 'Trang web'} · {source.document.active ? 'Đang dùng' : 'Đã tắt'} · Phiên bản {source.version}</span></button>)}
        <div className={styles.actions}><button disabled={busy || list.page === 1} onClick={() => loadPage(list.page - 1)}>Trước</button><button disabled={busy || list.page * list.pageSize >= list.total} onClick={() => loadPage(list.page + 1)}>Sau</button></div>
      </section>
      {editor ? <form onSubmit={save} className={styles.card}>
        <h2>{editor.version ? 'Thông tin nguồn' : 'Nguồn mới'}</h2>
        {canManage && editor.version > 0 && <IngestionStatusPanel key={`${editor.id}:${editor.version}`} sourceId={editor.id} version={editor.version} active={editor.document.active} />}
        <fieldset disabled={busy || !canManage}>
          <label>Tên nguồn<input required maxLength={200} value={editor.document.name} onChange={event => update({ name: event.target.value })} /></label>
          <label>Loại nguồn<select value={editor.document.kind} onChange={event => update(event.target.value === 'text' ? { kind: 'text', text: '', url: null } : { kind: 'html', text: null, url: '' })}><option value="text">Văn bản nhập trực tiếp</option><option value="html">Trang web HTTPS</option></select></label>
          {editor.document.kind === 'text' ? <label>Nội dung<textarea required maxLength={20000} rows={10} value={editor.document.text ?? ''} onChange={event => update({ text: event.target.value })} /></label> : <label>Liên kết tài liệu<input type="url" required maxLength={2048} placeholder="https://example.com/huong-dan" value={editor.document.url ?? ''} onChange={event => update({ url: event.target.value })} /></label>}
          <label>Nguồn thông tin<select value={editor.document.authority} onChange={event => update({ authority: event.target.value as SourceDocument['authority'] })}><option value="business">Tài liệu của doanh nghiệp</option><option value="reference">Tài liệu tham khảo bên ngoài</option></select></label>
          <label>Cần cập nhật sau (giờ)<input type="number" required min={1} max={720} value={editor.document.freshnessHours} onChange={event => update({ freshnessHours: Number(event.target.value) })} /></label>
          <label>Chủ đề liên quan (mỗi dòng một chủ đề)<textarea rows={3} value={editor.document.topics.join('\n')} onChange={event => update({ topics: event.target.value.split('\n') })} /></label>
          <p>{editor.document.productIds.length ? 'Sản phẩm liên quan:' : 'Áp dụng chung; có thể chọn sản phẩm để giới hạn phạm vi.'}</p>
          <div className={styles.chips}>{editor.document.productIds.map(id => <button type="button" key={id} onClick={() => update({ productIds: editor.document.productIds.filter(value => value !== id) })}>{editor.productNames[id] || 'Sản phẩm đã liên kết'} ×</button>)}</div>
          {canManage && <><label>Tìm sản phẩm để liên kết<input value={search} onChange={event => setSearch(event.target.value)} /></label>{productError && <p role="status">{productError}</p>}<select aria-label="Chọn sản phẩm liên quan" value="" onChange={event => {
            const product = products.find(item => item.id === event.target.value);
            if (product && !editor.document.productIds.includes(product.id)) setEditor({ ...editor, document: { ...editor.document, productIds: [...editor.document.productIds, product.id] }, productNames: { ...editor.productNames, [product.id]: product.name } });
          }}><option value="">Chọn sản phẩm…</option>{products.filter(product => !editor.document.productIds.includes(product.id)).map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></>}
          <label className={styles.check}><input type="checkbox" checked={editor.document.active} onChange={event => update({ active: event.target.checked })} />Đang dùng · bỏ chọn để tắt, giữ lịch sử</label>
        </fieldset>
        {canManage && <div className={styles.actions}><button type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu nguồn'}</button>{editor.version > 0 && <button type="button" disabled={busy} onClick={() => open(editor.id)}>Tải lại bản đã lưu</button>}</div>}
      </form> : <section className={styles.card}><h2>Chọn nguồn để xem</h2><p>Hỗ trợ văn bản và trang web. Việc lưu liên kết không tải nội dung trang web ngay.</p></section>}
    </div>
  </section>;
}
