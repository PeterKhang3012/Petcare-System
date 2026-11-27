# Cài đặt

Cài Docker Desktop ở chế độ Linux containers và Node.js 22.19 trở lên. Dùng Java 21 và Maven nếu chạy kiểm thử Payment ngoài Docker. Làm theo [README gốc](../../README.md) để chuẩn bị khóa JWT, token giữa các service và mật khẩu MySQL.

```powershell
Set-Location frontend
npm ci
```

Tạo `.env` từ `.env.example` tại root repo nếu cần cấu hình gateway. Kiểm thử trình duyệt dùng Playwright. Chạy `npx playwright install chromium` hoặc đặt `PAWSTAY_BROWSER_CHANNEL=chrome` nếu Chrome đã được cài.
