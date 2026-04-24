# 🏦 Self Bank - Dịch vụ Đối tác Tài chính

**Self Bank** là một dịch vụ backend độc lập được thiết kế để giả lập quy trình thẩm định và cấp vốn trả góp của các đối tác tài chính (ngân hàng, công ty tài chính).

Dự án này phục vụ môi trường **Kiểm thử Tích hợp (Integration Testing)**, giúp tách rời hệ thống E-commerce chính với logic của bên thứ ba, dễ dàng cho việc demo và mở rộng sau này.

## ✨ Tính Năng Nổi Bật

- **API Tiếp Nhận Hồ Sơ:** Nhận thông tin hồ sơ khách hàng vay qua RESTful API, bảo mật chặt chẽ bằng **HMAC SHA256** (chống Replay Attack bằng Timestamp lệch tối đa 5 phút).
- **Trang Quản Trị (Admin Dashboard):** Giao diện Server-Side Rendering (SSR) bằng EJS và Tailwind CSS, tích hợp Realtime qua Server-Sent Events (SSE) siêu nhẹ.
- **Phê Duyệt / Từ Chối Hồ Sơ:** Admin trực tiếp xem xét hồ sơ trên trình duyệt và bấm "Approve" hoặc "Reject". Nút Reject yêu cầu chọn mã lý do từ chối cụ thể.
- **Webhook Callback Tự Động:** Hệ thống tự động bắn kết quả duyệt (`APPROVED` hoặc `REJECTED` kèm lý do) về lại Hệ thống chính (Main System) thông qua cơ chế API Webhook bất đồng bộ.

## 🛠 Công Nghệ Sử Dụng

- **Backend Framework:** Node.js + Express.js v5
- **Ngôn ngữ:** TypeScript
- **Cơ sở dữ liệu:** PostgreSQL
- **ORM:** Prisma v7 (kết hợp `adapter-pg` pool)
- **Template Engine:** EJS
- **Styling:** Tailwind CSS (qua CDN)
- **Realtime:** Server-Sent Events (SSE) - Thuần Node.js (EventEmitter), không dùng thư viện ngoài nặng nề.

## 🚀 Hướng Dẫn Cài Đặt và Khởi Chạy

### 1. Yêu cầu hệ thống
- Node.js >= 18.x
- PostgreSQL database (Local hoặc Cloud như Render/Supabase)

### 2. Cài đặt

Clone dự án và cài đặt các thư viện:

```bash
git clone <your-repo-url>
cd credit-service
npm install
```

### 3. Cấu hình biến môi trường

Tạo file `.env` ở thư mục gốc của dự án và điền thông tin dựa trên cấu trúc mẫu:

```env
# Cấu hình CSDL PostgreSQL
DATABASE_URL="postgresql://user:password@localhost:5432/fake_bank_db"

# Cổng khởi chạy Server Node.js
PORT=3000

# Khóa bí mật bảo vệ API (HMAC)
API_KEY="test_api_key_123"
API_SECRET="test_api_secret_456"

# URL của Hệ thống chính nhận kết quả Callback
CALLBACK_URL="http://localhost:4000/api/webhook/loan-result"
```

### 4. Khởi tạo Database (Prisma)

Chạy lệnh dưới đây để đồng bộ và đẩy cấu trúc bảng xuống database:

```bash
npx prisma db push
```

### 5. Khởi chạy Server

**Môi trường Dev (Tự động hot-reload khi sửa code):**
```bash
npm run dev
```

**Môi trường Production (Build sang JS):**
```bash
npm run build
npm start
```

Sau khi chạy thành công, trang quản trị Admin sẽ khả dụng tại: `http://localhost:3000/admin`

---

## 📡 Tài Liệu API (API Contract)

### 1. Gửi Hồ Sơ Vay Mới
`POST /api/loan/apply`

**Headers Yêu Cầu:**
- `X-API-Key`: Mã Key định danh (ví dụ: `test_api_key_123`)
- `X-Timestamp`: UNIX timestamp hiện tại bằng giây (ví dụ: `1712345678`)
- `X-Signature`: Chuỗi HMAC SHA256 mã hóa dạng Hex, tạo từ chuỗi gốc `(Raw JSON Body) + "." + Timestamp` và khóa `API_SECRET`.
- `Content-Type`: `application/json`

**Request Body (JSON):**
```json
{
  "customerName": "Nguyễn Văn A",
  "amount": 50000000,
  "cccd": "012345678912",
  "phone": "+84987654321",
  "term": 12,
  "externalId": "SYS-98765",
  "documents": {
    "cccdUrl": "https://example.com/docs/cccd.jpg",
    "incomeProofUrl": "https://example.com/docs/income.pdf"
  }
}
```

> **Mẹo Test Postman nhanh:**
> Dự án đã cung cấp sẵn file `FakeBank_Postman_Collection.json`. Bạn chỉ cần chọn **Import** file này vào phần mềm Postman. Nó đã được lập trình tự động mã hoá HMAC ở tab *Pre-request Script*, giúp bạn test mà không phải tự tính mã băm!

### 2. Định Dạng Webhook Callback
Hệ thống này sẽ gọi một request `POST` đến `CALLBACK_URL` của Hệ thống chính.

**Headers gửi đi từ Fake Bank:**
- `X-Fake-Bank-Signature`: Chữ ký số HMAC SHA256 để Main System xác thực dữ liệu là chuẩn xác (được sinh ra bằng `API_SECRET`).

**Body (JSON) gửi về Main System:**
```json
{
  "loanId": "8ac1094c-1c6e-42dc-abf4-30d44b981350",
  "externalId": "SYS-98765",
  "status": "REJECTED",
  "reasonCode": "INSUFFICIENT_INCOME",
  "note": "Khách hàng không đủ sao kê lương 6 tháng",
  "timestamp": "2025-04-24T11:00:00Z"
}
```
*(Nếu `status` là `APPROVED`, các trường `reasonCode` và `note` sẽ không xuất hiện).*

---

## 🏗️ Cấu Trúc Thư Mục

```text
├── .github/workflows/       # File CI/CD tự động lên GitHub
├── docs/                    # Đặc tả yêu cầu kỹ thuật & Kế hoạch
├── prisma/                  # Định nghĩa Database Schema (Prisma v7)
├── src/
│   ├── controllers/         # Các logic xử lý API (Loan) & Render UI (Admin)
│   ├── lib/                 # Các Module tái sử dụng: Database (pg), Event(SSE), Auth
│   ├── middlewares/         # Tầng Middleware kiểm tra tính bảo mật HMAC
│   ├── routes/              # Router khai báo đường dẫn Express
│   ├── services/            # Service xử lý logic gọi Webhook Callback bất đồng bộ
│   ├── views/               # Các trang giao diện dạng EJS (layout, dashboard, detail)
│   └── index.ts             # File gốc khởi tạo ứng dụng Node.js/Express
└── FakeBank_Postman_Collection.json  # File Import cấu hình Postman
```

## 🔒 Bảo Mật (Security)
- **Ký điện tử HMAC:** Bảo vệ Endpoints 100%. Yêu cầu có định dạng không đúng (cố tình sửa JSON gửi đi giữa chừng) hoặc yêu cầu gửi trễ quá 5 phút (Replay Attack) sẽ tự động bị chặn.
- **SSRF Prevention:** Ngăn chặn lỗ hổng SSRF bằng hàm tự động kiểm tra `cccdUrl` và `incomeProofUrl` có bắt buộc bắt đầu bằng giao thức an toàn `http/https` hay không. 
- **Type Safety:** TypeScript + Prisma đảm bảo ứng dụng không xuất hiện các lỗi hỏng dữ liệu phổ biến liên quan tới kiểu trong quá trình vận hành.
