// SPDX-License-Identifier: Apache-2.0

const foundationSignals = [
  {
    label: "Ứng dụng",
    value: "Next.js đã sẵn sàng",
    state: "ready",
  },
  {
    label: "Dữ liệu",
    value: "Supabase qua migrations",
    state: "configured",
  },
  {
    label: "Trí tuệ",
    value: "API tương thích OpenAI",
    state: "configured",
  },
] as const;

export default function Home() {
  return (
    <main className="shell">
      <header className="masthead">
        <div className="brand-lockup">
          <span className="brand-signal" aria-hidden="true" />
          <span className="brand-name">OneVoice</span>
        </div>
        <a className="health-link" href="/api/health">
          Kiểm tra hệ thống
        </a>
      </header>

      <section className="foundation" aria-labelledby="foundation-title">
        <div className="foundation-copy">
          <p className="phase">Nền vận hành · bản 0.1.0</p>
          <h1 id="foundation-title">Một luồng dữ liệu. Một tiếng nói doanh nghiệp.</h1>
          <p className="lede">
            Nền kỹ thuật đã được tách khỏi nhà cung cấp dữ liệu và AI. Bước tiếp
            theo là đưa catalog cửa hàng máy tính vào nguồn dữ liệu có kiểm soát.
          </p>
        </div>

        <div className="signal-board" aria-label="Trạng thái nền hệ thống">
          {foundationSignals.map((signal) => (
            <div className="signal-row" key={signal.label}>
              <span className={`signal-dot signal-dot--${signal.state}`} aria-hidden="true" />
              <span className="signal-label">{signal.label}</span>
              <strong>{signal.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="next-action" aria-labelledby="next-action-title">
        <div>
          <p className="phase">Việc tiếp theo</p>
          <h2 id="next-action-title">Chuẩn hóa 10 sản phẩm mẫu</h2>
        </div>
        <p>
          Chọn một sản phẩm chủ lực, ghi rõ nguồn và thời điểm dữ liệu, sau đó
          tạo migration cùng seed có thể chạy lại trên máy sạch.
        </p>
      </section>

      <footer>
        <span>DX-OS · H–P–D–I</span>
        <span>Foundation checkpoint</span>
      </footer>
    </main>
  );
}
