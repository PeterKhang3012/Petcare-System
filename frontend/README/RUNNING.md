# Chạy ứng dụng

Từ thư mục gốc:

```powershell
docker compose config --quiet
docker compose up -d --build --wait
docker compose ps
Set-Location frontend
npm run dev
```

Mở `http://localhost:5173`. Đăng ký để dùng chức năng khách hàng. Khi chạy qua Compose, Auth tự seed tài khoản STAFF đã khai báo.

```powershell
npm run build
npm run preview
```

Build chạy kiểm tra TypeScript rồi xuất bundle vào `dist/`. Preview phục vụ bundle tại `http://localhost:4173` và dùng cùng thiết lập proxy. Nếu port bận, Vite in URL thực tế tại terminal.
