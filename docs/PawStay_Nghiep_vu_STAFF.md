# PAWSTAY — TỔNG HỢP NGHIỆP VỤ STAFF

Tài liệu bổ sung độc lập | Bản tổng hợp thảo luận, không thay thế tài liệu gốc.

## I. Tổng quan nghiệp vụ STAFF

Chỉ có hai vai trò USER và STAFF. STAFF vận hành cơ sở, không phải ADMIN. Quyền UPDATE_SERVICE_PRICE là quyền bổ sung, không phải role mới.

| Nhóm | Chức năng |
|---|---|
| Tổng quan | Theo dõi lịch, tài nguyên, cảnh báo, công việc cần xử lý |
| Care | Xem lịch, tiếp nhận, phục vụ, bàn giao |
| Stay | Xem lịch lưu trú, gia hạn, xử lý quá hạn |
| Tài nguyên | Kiểm tra, điều chuyển, vệ sinh, tạm ngừng và khôi phục |
| Tiếp nhận | Xác minh thú cưng, chủ, thanh toán và phòng |
| Chăm sóc | Ghi nhật ký và lịch sử chỉnh sửa |
| Bàn giao | Xác minh người nhận, trả đồ dùng, check-out |
| Phụ phí | Theo dõi, yêu cầu thanh toán, ghi nhận khoản chưa thu |
| Giao dịch | Tra cứu, đối chiếu và xử lý ngoại lệ |
| Hoàn tiền | Duyệt yêu cầu, theo dõi VNPAY Refund API |
| Bảng giá | Xem, cập nhật theo quyền, lưu lịch sử |

## II. Thông số vận hành đã thống nhất

| Thông số | Quy định |
|---|---|
| Cơ sở | Một cơ sở, chó và mèo |
| Giới hạn cân nặng | Chó 40 kg; mèo Stay 10 kg |
| Giờ tiếp nhận và bàn giao | 08:00–18:00 |
| Care | 60 phút/lượt, nghỉ trưa 12:00–13:00 |
| Stay | 1–14 đêm, check-in/out 08:00–18:00 |
| Mốc tính phí Stay | 14:00 |
| Vệ sinh Stay | 60 phút |
| Thức ăn | Bao gồm thức ăn cơ bản trong giá phòng |
| Thanh toán ban đầu | 100% qua VNPAY, giữ chỗ 15 phút |
| Nhân sự | Giả định đủ nhân sự Care và có người trực đêm |
| Sức chứa | Một thú cưng/tài nguyên tại một thời điểm |

## III. Quản lý tài nguyên

| Mã tài nguyên | Số lượng | Điều kiện cân nặng | Kích thước đề xuất (cm) |
|---|---:|---|---|
| CARE-01 đến CARE-08 | 8 | Theo dịch vụ | Chưa xác định |
| DOG-S-01 | 1 | Dưới 5 kg | 60 × 50 × 70 |
| DOG-M-01 | 1 | Dưới 15 kg | 80 × 60 × 70 |
| DOG-L-01 | 1 | Dưới 20 kg | 100 × 70 × 90 |
| DOG-XL-01 | 1 | Tối đa 40 kg | 150 × 120 × 150 |
| CAT-S-01, CAT-S-02 | 2 | Dưới 5 kg | 60 × 50 × 70 |
| CAT-M-01, CAT-M-02 | 2 | Tối đa 10 kg | 80 × 60 × 90 |

Tổng 16 tài nguyên. Kích thước vật lý chỉ là đề xuất đồ án, chưa xác minh tiêu chuẩn phúc lợi động vật. Chó và mèo không dùng chung phòng Stay. Thú cưng nhỏ được ở phòng lớn hơn, không áp dụng ngược lại. USER chọn loại phòng, backend phân bổ mã cụ thể.

- READY → OCCUPIED khi check-in; OCCUPIED → CLEANING khi bàn giao; CLEANING → READY khi vệ sinh hoàn tất.
- READY có thể chuyển OUT_OF_SERVICE và khôi phục khi đủ điều kiện. Kiểm tra booking bị ảnh hưởng trước khi tạm ngừng.
- STAFF xem danh sách, lịch phân bổ, trạng thái thực tế, phòng khả dụng; điều chuyển, xác nhận vệ sinh, tạm ngừng và khôi phục.
- Không tự giải phóng phòng đang có thú cưng. OVERDUE là cảnh báo, không phải trạng thái vật lý.
- Tài nguyên hiện khởi tạo bằng script; CRUD phòng trên web chưa chốt.

## IV. Bảng giá dịch vụ

### 4.1. Dog Care — tắm chó (VNĐ/lượt)

| Cân nặng | Lông ngắn | Lông dài |
|---|---:|---:|
| Dưới 5 kg | 100.000 | 150.000 |
| 5–dưới 10 kg | 150.000 | 250.000 |
| 10–dưới 20 kg | 250.000 | 350.000 |
| 20–40 kg | 350.000 | 500.000 |

### 4.2. Cat Care — tắm mèo (VNĐ/lượt)

| Cân nặng | Lông ngắn | Lông dài |
|---|---:|---:|
| Dưới 5 kg | 200.000 | 200.000 |
| 5–10 kg | 300.000 | 300.000 |

Không hỗ trợ tắm trực tuyến cho mèo trên 10 kg. Giá cắt tỉa và vệ sinh khác chưa chốt. Care cố định 60 phút, gồm chuẩn bị và vệ sinh.

### 4.3. Dog Stay (VNĐ/ngày, gồm thức ăn)

| Phòng | <2 kg | 2–<5 kg | 5–<10 kg | 10–<15 kg | 15–<20 kg | 20–40 kg |
|---|---:|---:|---:|---:|---:|---:|
| S | 70.000 | 80.000 | — | — | — | — |
| M | 90.000 | 100.000 | 110.000 | 120.000 | — | — |
| L | 120.000 | 130.000 | 140.000 | 150.000 | 160.000 | — |
| XL | 210.000 | 220.000 | 230.000 | 240.000 | 250.000 | 300.000 |

### 4.4. Cat Stay (VNĐ/ngày, gồm thức ăn)

| Phòng | Dưới 5 kg | 5–10 kg |
|---|---:|---:|
| S | 80.000 | — |
| M | 100.000 | 120.000 |

Dấu — là không hỗ trợ, không phải giá 0. Ví dụ chó 8 kg được chọn M (110.000), L (140.000) hoặc XL (230.000), nếu còn phòng. Nguồn tham khảo bảng giá và cách tính ngày: https://knkfamily.com/dich-vu/01_khach-san-thu-cung/ (theo nội dung người dùng cung cấp; bảng PawStay đã điều chỉnh).

## V. Quản lý đặt lịch Care

| Khung giờ | Chỗ tối đa |
|---|---:|
| 08:00–09:00 | 8 |
| 09:00–10:00 | 8 |
| 10:00–11:00 | 8 |
| 11:00–12:00 | 8 |
| 12:00–13:00 | 0 |
| 13:00–14:00 | 8 |
| 14:00–15:00 | 8 |
| 15:00–16:00 | 8 |
| 16:00–17:00 | 8 |
| 17:00–18:00 | 8 |
| Tổng lý thuyết | 72 |

Số chỗ thực tế tính động theo tài nguyên khả dụng. USER đặt và thanh toán → CONFIRMED → STAFF kiểm tra, xác minh và check-in → CHECKED_IN → phục vụ, nhật ký → bàn giao COMPLETED → CLEANING → READY.

| Tình huống | Xử lý |
|---|---|
| Đến sớm | Chờ giờ hẹn |
| Muộn trong 15 phút | Tiếp nhận nếu còn khả năng phục vụ |
| Muộn quá 15 phút | NO_SHOW, không hoàn tiền |
| Sai cân nặng không đổi nhóm giá | Ghi nhận, tiếp nhận nếu đủ điều kiện |
| Sai nhóm giá | Không check-in; hỗ trợ hủy, hoàn tiền và đặt lại |
| Vượt 60 phút | STAFF xử lý xung đột, không cấp tài nguyên đang bận |
| Chưa vệ sinh hoặc chưa bàn giao | Không tiếp nhận lượt mới tại tài nguyên đó |
| Cơ sở không thể phục vụ | STAFF hủy, hoàn 100% |

## VI. Quản lý đặt phòng Stay

USER chọn thú cưng, loại phòng, ngày giờ đến và về; 1–14 đêm. Backend kiểm tra sở hữu, loài, cân nặng, lịch trùng của thú cưng và phòng, kể cả 60 phút vệ sinh. Giữ chỗ 15 phút, trả trước 100%. Lưu giá snapshot. Không ghi đè thời gian đặt ban đầu bằng thời gian thực tế.

| Hoạt động | Giờ | Hệ số ngày |
|---|---|---:|
| Check-in | 08:00 đến trước 14:00 | 1 |
| Check-in | 14:00–18:00 | 0,5 |
| Check-out | 08:00 đến trước 14:00 | 0,5 |
| Check-out | 14:00–18:00 | 1 |
| Ngày trọn vẹn ở giữa | Cả ngày | 1 |

Công thức: D = (N − 1) + F_in + F_out; T = P × D. N là số đêm, D là số ngày tính phí, P là đơn giá/ngày. Ví dụ một đêm, đến 15h và về 10h: 1 ngày phí; về 16h: 1,5 ngày phí. Mốc đúng 14h thuộc buổi chiều.

| Tình huống | Xử lý |
|---|---|
| Đến sớm | Kiểm tra phòng và phí bổ sung nếu vượt phần đã đặt |
| Đến muộn | Không hoàn chênh lệch; hạn NO_SHOW Stay chưa chốt |
| Trả sớm | Không hoàn chênh lệch |
| Trả muộn | Tính phụ phí, cảnh báo xung đột |
| Gia hạn | Kiểm tra phòng, thanh toán bổ sung |
| Bỏ rơi thú cưng | Ngoài phạm vi pháp lý; vẫn giữ phòng OCCUPIED và booking CHECKED_IN |

## VII. Quá hạn, phụ phí và điều chuyển phòng

| Khung giờ quá hạn | Tỷ lệ phụ phí đã chốt |
|---|---:|
| 08:00 đến trước 14:00 | 50% đơn giá/ngày |
| 14:00–18:00 | 50% đơn giá/ngày |
| Sau 18:00 | 100% đơn giá/ngày |

| Đơn giá/ngày | 50% | 100% |
|---:|---:|---:|
| 70.000 | 35.000 | 70.000 |
| 110.000 | 55.000 | 110.000 |
| 140.000 | 70.000 | 140.000 |
| 250.000 | 125.000 | 250.000 |
| 300.000 | 150.000 | 300.000 |

Tính từ đơn giá snapshot. Cách cộng dồn nhiều khung giờ, qua ngày và quan hệ với phí vượt mốc 14h chưa chốt; không mặc định một công thức. Backend tính, STAFF không tự sửa số tiền.

- Quá giờ: ghi nhận quá hạn, tính phụ phí, giữ CHECKED_IN và OCCUPIED.
- Cảnh báo STAFF khi có booking kế tiếp bị ảnh hưởng; mốc 120 phút là ngưỡng cảnh báo đề xuất, không tự động hủy.
- STAFF kiểm tra thủ công danh sách phòng thay thế; backend kiểm tra lại khi xác nhận.
- Phòng mới cùng loài, đủ cân nặng, cùng hạng hoặc cao hơn, khả dụng toàn kỳ và thời gian vệ sinh; READY khi tiếp nhận.
- Nếu còn phòng: STAFF điều chuyển booking kế tiếp, giữ mã booking, giá và trạng thái; không thu thêm do lỗi cơ sở. Lưu phòng cũ/mới, lý do, thời gian, STAFF.
- Nếu không còn phòng: STAFF hủy booking bị ảnh hưởng, tạo yêu cầu hoàn 100%, STAFF duyệt, Payment gọi VNPAY Refund API.

Ví dụ: A ở DOG-M-01, dự kiến trả 12h nhưng chưa trả lúc 14h. B đặt phòng M cho chó 8 kg. Nếu DOG-L-01 khả dụng toàn kỳ, STAFF chuyển B sang L, giữ giá 110.000/ngày thay vì 140.000/ngày. Nếu không có phòng phù hợp, STAFF hủy B và hoàn 100%.

## VIII. Tiếp nhận thú cưng

STAFF kiểm tra booking CONFIRMED, thời gian, thanh toán, chủ (họ tên, số điện thoại), thú cưng (tên, loài, giống, cân nặng, loại lông), tài nguyên READY và nhóm giá. Phiếu tiếp nhận gồm booking_id, pet_id, staff_id, actual_check_in, actual_weight, pet_condition, feeding_instructions, care_instructions, belongings, notes. Sai nhóm giá Care: không check-in, hỗ trợ hủy/hoàn/đặt lại. Phương án sai nhóm giá Stay cần chốt riêng.

## IX. Chăm sóc thú cưng

Nhật ký gồm thời gian, nội dung, STAFF thực hiện; sửa phải lưu dấu vết. USER chỉ xem nhật ký booking của mình. Mã hoạt động đề xuất: FEEDING, DRINKING, BATHING, GROOMING, CLEANING, RESTING, HEALTH_OBSERVATION, OTHER. Ghi nhận hướng dẫn ăn uống, khẩu phần và hoạt động cho ăn; không quản lý kho hoặc định lượng theo gram.

## X. Gia hạn lưu trú

USER/STAFF ghi nhận nhu cầu → Booking kiểm tra khả dụng và giới hạn 14 đêm → STAFF xác nhận phương án → tính phí → USER thanh toán VNPAY → Payment xác minh → Booking cập nhật phân bổ và lưu lịch sử gia hạn. Chỉ xác nhận khi thanh toán thành công và phòng vẫn khả dụng; quá hạn không tự coi là gia hạn. Cơ chế giữ chỗ trong lúc thanh toán gia hạn cần đặc tả khi triển khai.

## XI. Bàn giao và thanh toán phụ phí

STAFF xác minh người nhận, ghi giờ thực tế, chốt phụ phí, trả đồ dùng và ghi chú. USER thanh toán bổ sung VNPAY; nếu thất bại yêu cầu phương thức khác. Vẫn phải bàn giao cho chủ kể cả chưa thu được phụ phí. Không giữ thú cưng để thu nợ.

| Phương thức | Booking ban đầu | Phụ phí |
|---|---|---|
| VNPAY | Có | Có |
| CASH | Không | Đề xuất |
| BANK_TRANSFER | Không | Đề xuất |

STAFF xác nhận tiền mặt/chuyển khoản nếu được hỗ trợ, lưu số tiền, phương thức, thời gian, người xác nhận và bằng chứng/ghi chú. Nếu VNPAY timeout hoặc chưa rõ kết quả, đối chiếu trước khi thu lại để tránh thu hai lần.

| Tình huống | Booking | Phụ phí | Phòng |
|---|---|---|---|
| Đang lưu trú | CHECKED_IN | Chưa phát sinh | OCCUPIED |
| Quá hạn | CHECKED_IN | UNPAID | OCCUPIED |
| Đã bàn giao, đã thu | COMPLETED | PAID | CLEANING |
| Đã bàn giao, chưa thu | COMPLETED | UNPAID | CLEANING |
| Vệ sinh xong | COMPLETED | PAID/UNPAID | READY |

PAID/UNPAID là trạng thái đề xuất cho khoản phụ phí, độc lập booking. Không sửa giao dịch gốc; tạo giao dịch bổ sung. Không xây dựng thu hồi công nợ chuyên sâu.

## XII. Hủy booking và hoàn tiền

| Tình huống | Hoàn tiền |
|---|---|
| Chưa thanh toán, hủy/hết hạn | Không phát sinh nếu chưa thu tiền |
| Hủy trước giờ bắt đầu ít nhất 24h | 100% |
| Hủy dưới 24h | 0% |
| NO_SHOW | 0% |
| Cơ sở không thể phục vụ, không còn phòng thay thế | 100% |
| Sai nhóm giá khi check-in, hủy theo chính sách | 100% |
| Check-out sớm | Không hoàn chênh lệch |
| Đã check-in | USER không tự hủy |

Đề xuất: thanh toán xác minh thành công sau khi booking hết hạn hoặc bị hủy trước xác nhận thanh toán thì tạo yêu cầu hoàn 100% cho STAFF duyệt; không khôi phục booking, chống tạo trùng. Không áp dụng nhầm cho booking đã xác nhận rồi hủy muộn.

Booking xác định điều kiện và số tiền → REQUESTED → STAFF duyệt → Payment gọi VNPAY Refund API → PROCESSING → COMPLETED hoặc REJECTED khi có căn cứ xác minh cuối cùng. Timeout hoặc 05/06 chưa phải hoàn tất; không tự gửi lại hoặc đánh dấu thành công. Cơ chế đối chiếu riêng giao dịch hoàn tiền cần xác minh Sandbox. Chính sách hủy/hoàn phải hiển thị trước thanh toán và ghi nhận USER chấp thuận.

## XIII. Quản lý bảng giá

STAFF xem giá; chỉ STAFF có UPDATE_SERVICE_PRICE được cập nhật. Lưu ID mức giá, giá cũ/mới, phiên bản, thời gian, lý do, người thực hiện; kiểm tra xung đột phiên bản và giá hợp lệ. Không sửa giá booking đã chốt, không tự sửa phụ phí, không tự cấp quyền. Quyền xem lịch sử của STAFF thường chưa quy định. Thêm/xóa dịch vụ chưa thuộc phạm vi hiện tại.

## XIV. Danh sách business rules Stay dự kiến

Mã ST là mã dự kiến, chưa thay thế BR trong tài liệu gốc.

| Mã | Quy tắc |
|---|---|
| ST01 | USER chọn ngày giờ check-in/out. |
| ST02 | Tiếp nhận và bàn giao 08:00–18:00. |
| ST03 | Lưu trú 1–14 đêm. |
| ST04 | Tính phí nửa ngày, mốc 14h. |
| ST05 | Giá gồm thức ăn cơ bản. |
| ST06 | Giá theo loài, cân nặng, loại phòng. |
| ST07 | Phòng chó và mèo riêng. |
| ST08 | Một thú cưng/phòng tại một thời điểm. |
| ST09 | Thú cưng nhỏ được ở phòng lớn, không ngược lại. |
| ST10 | USER chọn loại phòng, backend cấp mã phòng. |
| ST11 | Phân bổ thêm 60 phút vệ sinh. |
| ST12 | Không cấp trùng tài nguyên. |
| ST13 | Trả trước 100% VNPAY. |
| ST14 | Check-in sớm kiểm tra khả dụng và phí. |
| ST15 | Đến muộn hoặc trả sớm không hoàn chênh lệch. |
| ST16 | Gia hạn kiểm tra khả dụng và thanh toán. |
| ST17 | Giữ đơn giá snapshot. |
| ST18 | Quá giờ trả phòng ghi nhận quá hạn. |
| ST19 | Khung 08h–14h: phụ phí 50%. |
| ST20 | Khung 14h–18h: phụ phí 50%. |
| ST21 | Sau 18h: phụ phí 100%. |
| ST22 | Backend tính phụ phí. |
| ST23 | Cảnh báo quá hạn và booking bị ảnh hưởng. |
| ST24 | Không tự động hủy booking kế tiếp. |
| ST25 | STAFF chọn phòng thay thế. |
| ST26 | Backend kiểm tra chống trùng khi đổi phòng. |
| ST27 | Phòng thay thế phù hợp loài, cân nặng, khả dụng. |
| ST28 | Đổi phòng do lỗi cơ sở giữ nguyên giá. |
| ST29 | Lưu lịch sử điều chuyển. |
| ST30 | STAFF hủy nếu không còn phương án phục vụ. |
| ST31 | Hủy do cơ sở không phục vụ: hoàn 100%. |
| ST32 | VNPAY Refund API sau STAFF xác nhận. |
| ST33 | Phụ phí độc lập giao dịch ban đầu. |
| ST34 | VNPAY thất bại yêu cầu phương thức khác. |
| ST35 | Không từ chối bàn giao vì chưa thu phụ phí. |
| ST36 | Lưu khoản phí chưa thu. |
| ST37 | Hoàn tất booking sau bàn giao thực tế. |
| ST38 | READY sau vệ sinh hoàn tất. |
| ST39 | Không giải phóng phòng khi còn thú cưng. |
| ST40 | Xử lý pháp lý bỏ rơi ngoài phạm vi. |

## XV. Phân chia Microservices

| Service | Database | Trách nhiệm |
|---|---|---|
| Auth | auth_db | USER, STAFF, quyền, username/password, fullname, phone |
| Pet | pet_db | Hồ sơ, sở hữu, loài, cân nặng, loại lông |
| Catalog | catalog_db | Ma trận giá, điều kiện phòng, phiên bản |
| Booking | booking_db | Booking, tài nguyên, giá snapshot, phụ phí, quá hạn, điều chuyển, gia hạn, hủy |
| Payment | payment_db | VNPAY, giao dịch bổ sung, thanh toán thay thế, đối chiếu, hoàn tiền |
| Care | care_db | Tiếp nhận, thời gian thực tế, nhật ký, bàn giao |

API Gateway là điểm truy cập USER/STAFF. Giữ sáu service, sáu database. Booking lưu scheduled_check_in/out, allocation_start/end; Care ghi actual_check_in/out và đồng bộ kết quả cần thiết cho Booking. Không ghi đè lịch gốc.

## XVI. Giao diện STAFF đề xuất

Sidebar: Tổng quan; Đặt lịch Care; Đặt phòng Stay; Tài nguyên; Chăm sóc; Quá hạn & phụ phí; Giao dịch; Hoàn tiền; Bảng giá; Đăng xuất. Dashboard hiển thị lịch Care, đang lưu trú, chờ tiếp nhận/bàn giao, số tài nguyên theo trạng thái, booking quá hạn/bị ảnh hưởng, yêu cầu hoàn và phụ phí chưa thu. Đây là đề xuất UI, không phải màn hình đã triển khai.

## XVII. Ngoài phạm vi

Tạo STAFF hoặc tự cấp quyền; quản lý nhân sự, lương, phân ca; sửa giá booking; ghi đè kết quả VNPAY; kho thức ăn; khám chữa bệnh chuyên sâu; xử lý pháp lý thú cưng bị bỏ rơi; thu hồi công nợ chuyên sâu; nhiều chi nhánh; STAFF tạo booking thay USER trong phiên bản hiện tại.

## XVIII. Nội dung còn cần chốt

| Vấn đề | Cần xác định |
|---|---|
| Phụ phí nhiều khung | Cộng dồn hay tỷ lệ khung cuối; có cộng phí vượt 14h không |
| Quá hạn qua ngày | Công thức tiếp tục tính |
| NO_SHOW Stay | Hạn cuối check-in |
| Sai cân nặng Stay | Điều chuyển, thu chênh lệch hay hủy/đặt lại |
| Thanh toán thay thế | CASH, BANK_TRANSFER hay cả hai |
| Tài nguyên | Có thêm/sửa/ngừng vĩnh viễn phòng trên web không |
| Dịch vụ | Thêm/ngừng dịch vụ hay chỉ đổi giá |
| Care | Giá cắt tỉa và vệ sinh ngoài tắm |
| Bàn giao | Phương thức xác minh người nhận/ủy quyền |
| Refund API | Cách xác minh kết quả cuối sau timeout/05/06 |

## XIX. Kết luận phạm vi

Bốn nghiệp vụ cốt lõi: quản lý tài nguyên; đặt lịch và lưu trú; thanh toán và đối chiếu; tiếp nhận, chăm sóc và bàn giao. Hai role, sáu microservices, sáu database, 11 nhóm chức năng STAFF, 16 tài nguyên, 9 khung Care/ngày, tối đa lý thuyết 72 lượt Care/ngày và 8 thú cưng Stay đồng thời.

Tài liệu này tổng hợp các quyết định và đề xuất trong cuộc thảo luận, chưa xác nhận source code đã triển khai. Các nội dung chưa chốt được giữ nguyên trạng thái đề xuất. Không sửa tài liệu PawStay gốc.
