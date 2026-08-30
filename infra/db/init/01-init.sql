-- Khởi tạo lần đầu: DB cho Keycloak, Chatwoot và schema lõi OpenCorp.
CREATE DATABASE keycloak;
CREATE DATABASE chatwoot;

\connect opencorp

-- Nhân sự (người và AI cùng một bảng — AI là "đồng nghiệp")
CREATE TABLE employees (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('human', 'ai')),
  department  TEXT NOT NULL,          -- marketing | cskh | kinhdoanh | dieuhanh | kythuat
  role        TEXT NOT NULL,
  active      BOOLEAN DEFAULT TRUE
);

-- Catalog cửa hàng máy tính (nạp dữ liệu thật sau buổi phỏng vấn 01/09)
CREATE TABLE products (
  id          SERIAL PRIMARY KEY,
  sku         TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  price_vnd   BIGINT NOT NULL,
  specs       JSONB DEFAULT '{}',
  stock       INT DEFAULT 0,
  warranty_months INT DEFAULT 12
);

CREATE TABLE orders (
  id          SERIAL PRIMARY KEY,
  customer    TEXT NOT NULL,
  channel     TEXT NOT NULL,          -- fanpage | zalo | live | tai_quay
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','done','cancelled')),
  total_vnd   BIGINT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE order_items (
  order_id    INT REFERENCES orders(id),
  product_id  INT REFERENCES products(id),
  qty         INT NOT NULL DEFAULT 1
);

-- Ticket bảo hành / hỗ trợ
CREATE TABLE tickets (
  id          SERIAL PRIMARY KEY,
  customer    TEXT NOT NULL,
  serial_no   TEXT,
  issue       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'received'
              CHECK (status IN ('received','diagnosing','repairing','ready','closed','escalated')),
  assignee_id INT REFERENCES employees(id),
  summary     TEXT,                   -- bản tóm tắt AI bàn giao cho người thật
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Xưởng nội dung: bài viết + vòng lặp QC
CREATE TABLE posts (
  id          SERIAL PRIMARY KEY,
  pillar      TEXT NOT NULL,          -- gioi_thieu | meo | hau_truong | khuyen_mai
  content     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft','qc_rejected','qc_passed','approved','published')),
  qc_round    INT DEFAULT 0,
  qc_feedback TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Tài liệu nội bộ (P.A.R.A + nhãn phòng ban cho RAG phân quyền)
CREATE TABLE documents (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  para        TEXT NOT NULL CHECK (para IN ('project','area','resource','archive')),
  department  TEXT NOT NULL,          -- phòng ban sở hữu; 'chung' = ai cũng đọc được
  version     TEXT DEFAULT 'v1',
  body        TEXT NOT NULL
);

-- Nhật ký agent — nguồn dữ liệu của Mission Control
CREATE TABLE agent_log (
  id          SERIAL PRIMARY KEY,
  agent       TEXT NOT NULL,
  department  TEXT NOT NULL,
  event       TEXT NOT NULL,
  detail      JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ---------- Seed demo (thay bằng dữ liệu thật sau 01/09) ----------
INSERT INTO employees (name, kind, department, role) VALUES
  ('Chủ cửa hàng',            'human', 'dieuhanh',  'Giám đốc'),
  ('NV Kỹ thuật 1',           'human', 'kythuat',   'Kỹ thuật viên'),
  ('NV Bán hàng 1',           'human', 'kinhdoanh', 'Tư vấn bán hàng'),
  ('Writer-GioiThieu',        'ai',    'marketing', 'Content Writer'),
  ('Writer-KhuyenMai',        'ai',    'marketing', 'Content Writer'),
  ('QC-Truong-Phong',         'ai',    'marketing', 'QC / Trưởng phòng nội dung'),
  ('CSKH-TuVan',              'ai',    'cskh',      'Tư vấn first-line'),
  ('CSKH-BaoHanh',            'ai',    'cskh',      'Điều phối bảo hành'),
  ('TroLy-TriThuc',           'ai',    'chung',     'Trợ lý tri thức nội bộ');

INSERT INTO products (sku, name, category, price_vnd, specs, stock, warranty_months) VALUES
  ('CPU-5600',  'AMD Ryzen 5 5600',            'cpu',  2890000, '{"cores":6,"threads":12}', 15, 36),
  ('GPU-4060',  'GeForce RTX 4060 8GB',        'gpu',  7990000, '{"vram_gb":8}',            8,  36),
  ('RAM-16-32', 'RAM DDR4 16GB 3200MHz',       'ram',   890000, '{"size_gb":16}',           40, 36),
  ('SSD-1TB',   'SSD NVMe 1TB Gen4',           'ssd',  1690000, '{"size_gb":1000}',         25, 60),
  ('MON-24-165','Màn hình 24\" 165Hz IPS',     'man_hinh', 3290000, '{"hz":165}',           12, 36);

INSERT INTO documents (title, para, department, body) VALUES
  ('Quy trình tiếp nhận máy bảo hành', 'resource', 'kythuat',
   '5 bước: (1) kiểm tra serial và hạn bảo hành; (2) lập phiếu tình trạng máy có chữ ký khách; (3) dán tem và nhập kho bảo hành; (4) chẩn đoán trong 24h và báo khách; (5) sửa xong gọi khách nghiệm thu rồi trả máy.'),
  ('Chính sách đổi trả', 'resource', 'chung',
   'Đổi mới trong 7 ngày nếu lỗi nhà sản xuất, sản phẩm còn đủ hộp và phụ kiện. Không áp dụng với sản phẩm trầy xước do người dùng.'),
  ('Quy chế lương thưởng', 'resource', 'nhansu',
   'Tài liệu giới hạn phòng nhân sự — dùng để demo cảnh AI từ chối truy cập ngoài quyền hạn.');

INSERT INTO agent_log (agent, department, event, detail) VALUES
  ('QC-Truong-Phong', 'marketing', 'khoi_dong', '{"note":"Hệ thống OpenCorp khởi tạo."}');
