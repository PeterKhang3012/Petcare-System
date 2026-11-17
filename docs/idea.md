# Đề xuất đồ án PawStay

**Hệ thống chăm sóc và lưu trú thú cưng**

- **Tên đề tài:** Xây dựng hệ thống quản lý chăm sóc và lưu trú thú cưng PawStay theo kiến trúc microservices
- **Môn học:** Kiến trúc hướng dịch vụ — SOA
- **Công nghệ dự kiến:** FastAPI, MySQL, HTML/CSS/JavaScript, Docker Compose
- **Vai trò sử dụng:** Chủ thú cưng và Nhân viên

---

## 1. Giới thiệu đề tài

PawStay là hệ thống web mô phỏng hoạt động của một cơ sở cung cấp dịch vụ chăm sóc và lưu trú thú cưng. Chủ thú cưng có thể quản lý hồ sơ, xem dịch vụ, đặt lịch chăm sóc hoặc chỗ lưu trú, thanh toán và theo dõi quá trình phục vụ. Nhân viên sử dụng hệ thống để tiếp nhận, quản lý tình trạng tài nguyên, ghi nhật ký chăm sóc và bàn giao thú cưng.

Bài toán chính là liên kết thông tin thú cưng, lịch đặt, tài nguyên phục vụ, thanh toán và hoạt động chăm sóc thành một quy trình thống nhất. Hệ thống cần ngăn đặt trùng tài nguyên, phân biệt booking đang giữ chỗ với booking đã xác nhận, đồng thời bảo đảm người dùng chỉ truy cập dữ liệu thuộc phạm vi được phép.

Đề tài triển khai theo kiến trúc microservices nhằm thực hành phân tách trách nhiệm, thiết kế hợp đồng API, tích hợp dịch vụ bên thứ ba và xử lý lỗi khi các thành phần cập nhật không đồng thời.

Phiên bản đồ án sử dụng hai vai trò: Chủ thú cưng và Nhân viên. Danh mục dịch vụ, giá ban đầu, tài nguyên và tài khoản nhân viên được khởi tạo bằng script. Một tài khoản nhân viên được ủy quyền cập nhật bảng giá dịch vụ; các nhân viên khác chỉ xem giá và thực hiện nghiệp vụ vận hành. Phiên bản này không xây dựng vai trò hoặc giao diện Admin.

## 2. Mục tiêu của đồ án

1. Xây dựng quy trình hoàn chỉnh từ đặt dịch vụ hoặc lưu trú đến thanh toán, tiếp nhận, chăm sóc và bàn giao.
2. Triển khai bốn nghiệp vụ cốt lõi có quy tắc, dữ liệu và kết quả xử lý rõ ràng.
3. Phát triển các service độc lập, giao tiếp qua REST API và sở hữu dữ liệu riêng.
4. Tích hợp một cổng thanh toán sandbox để trình diễn luồng thanh toán thực tế.
5. Kiểm soát đặt chỗ đồng thời, thông báo thanh toán gửi lặp và truy cập dữ liệu ngoài quyền.
6. Có cơ chế phục hồi khi Payment, Booking hoặc Care tạm thời không thể đồng bộ.
7. Đóng gói hệ thống bằng Docker Compose, kèm tài liệu và kịch bản kiểm thử phục vụ trình diễn.

## 3. Phạm vi triển khai

### 3.1 Phạm vi nghiệp vụ

Phiên bản đầu phục vụ một cơ sở và hai nhóm thú cưng là chó, mèo. Dịch vụ gồm tắm, vệ sinh, cắt tỉa và lưu trú qua đêm.

Mỗi booking dành cho một thú cưng và một dịch vụ chăm sóc hoặc một lượt lưu trú. Khách thanh toán toàn bộ trước khi booking được xác nhận. Hệ thống sử dụng một cổng thanh toán sandbox, dự kiến VNPAY.

Đặt lịch chăm sóc được tính theo khung thời gian và thời lượng dịch vụ. Đặt lưu trú được tính theo số đêm, tối thiểu một đêm.

Giao diện tập trung vào luồng chính của Chủ thú cưng và Nhân viên. Dữ liệu cập nhật bằng polling khi màn hình đang mở; chu kỳ đề xuất là 15 giây.

### 3.2 Dữ liệu khởi tạo

Script khởi tạo cung cấp:

1. Danh mục dịch vụ, giá, thời lượng và điều kiện áp dụng.
2. Danh sách chỗ lưu trú và vị trí phục vụ.
3. Giờ hoạt động, giờ nhận và trả lưu trú, thời gian chuẩn bị tài nguyên.
4. Tài khoản nhân viên và dữ liệu mẫu phục vụ demo.

Giá ban đầu được khởi tạo trong Catalog. Nhân viên có quyền `UPDATE_SERVICE_PRICE` được cập nhật bảng giá trên web, có lưu phiên bản và lịch sử thay đổi. Quyền này được người triển khai gán qua script khởi tạo; nhân viên không tự cấp quyền hoặc tạo thêm tài khoản nhân viên trên web. Hệ thống vẫn chỉ có hai vai trò. Script khởi tạo không ghi đè các phiên bản giá đã được cập nhật.

### 3.3 Phạm vi phát triển sau

Các chức năng sau chưa thuộc tiêu chí nghiệm thu của phiên bản đầu:

- Nhiều chi nhánh và ứng dụng di động.
- Khám chữa bệnh chuyên sâu, camera trực tiếp và SMS.
- Hoàn tiền tự động qua cổng thanh toán.
- Dịch vụ bổ sung trong kỳ lưu trú và danh sách chờ tự động.
- Quản lý nhân sự, ca làm việc, phân quyền trên web và lập lịch thay đổi giá trong tương lai.

## 4. Người dùng và phân quyền

### 4.1 Chủ thú cưng

Chủ thú cưng được đăng ký, đăng nhập và quản lý hồ sơ thú cưng của mình; xem dịch vụ, giá và khả dụng; tạo booking; thanh toán; hủy theo điều kiện; xem lịch sử, giao dịch và nhật ký liên quan đến mình.

### 4.2 Nhân viên

Nhân viên được xem lịch phục vụ tại cơ sở, tiếp nhận thú cưng, ghi nhật ký, xác nhận bàn giao và cập nhật tình trạng vận hành của tài nguyên. Nhân viên được xem thông tin giao dịch cần thiết, yêu cầu đối chiếu và theo dõi quá trình xử lý ngoại lệ.

Nhân viên không được tự cấp quyền, tạo thêm tài khoản nhân viên, sửa giá đã chốt của booking hoặc ghi đè kết quả thanh toán. Nhân viên được ủy quyền chỉ cập nhật bảng giá trong Catalog; quyền này không cho phép sửa lịch sử booking hoặc kết quả giao dịch.

Quyền `UPDATE_SERVICE_PRICE` là quyền nghiệp vụ bổ sung trong vai trò Nhân viên, không phải một vai trò quản trị mới. Backend kiểm tra quyền này trên từng yêu cầu cập nhật giá. Dữ liệu đăng ký công khai hoặc trường quyền do frontend gửi không được dùng để tự nâng quyền.

### 4.3 Ma trận quyền

| Hoạt động | Chủ thú cưng | Nhân viên |
|---|---|---|
| Đăng ký tài khoản công khai | Tạo tài khoản khách | Tài khoản khởi tạo sẵn |
| Quản lý hồ sơ thú cưng | Hồ sơ thuộc sở hữu | Xem thông tin cần thiết cho lượt phục vụ |
| Xem danh mục và giá | Có | Có |
| Tạo booking trực tuyến | Cho thú cưng của mình | Ngoài phạm vi bản đầu |
| Thanh toán | Booking của mình | Xem và yêu cầu đối chiếu |
| Hủy booking | Theo chính sách | Không tùy ý bỏ qua chính sách |
| Check-in và check-out | Không | Có, theo điều kiện |
| Ghi nhật ký chăm sóc | Không | Có |
| Xem nhật ký | Lượt phục vụ của mình | Lượt phục vụ tại cơ sở |
| Cập nhật khả năng phục vụ | Không | Có, theo quy tắc tài nguyên |
| Cập nhật bảng giá dịch vụ | Không | Chỉ nhân viên có `UPDATE_SERVICE_PRICE` |
| Sửa giá booking đã chốt | Không | Không |
| Cấp quyền hoặc tạo tài khoản nhân viên | Không | Không |

Quyền được kiểm tra tại backend cho từng yêu cầu. API của khách phải kiểm tra cả vai trò và quyền sở hữu đối tượng; API nội bộ phải xác thực service gọi đến. Đây là cách áp dụng quyền tối thiểu và kiểm tra quyền trên từng yêu cầu theo hướng dẫn OWASP [6].

## 5. Bốn nghiệp vụ cốt lõi

### 5.1 Quản lý tài nguyên phục vụ

Tài nguyên gồm chỗ lưu trú và vị trí phục vụ chăm sóc, mỗi tài nguyên có mã, loại, điều kiện sử dụng và lịch phân bổ.

Nhân viên theo dõi tình trạng thực tế và cập nhật việc vệ sinh hoặc tạm ngừng sử dụng. Các thao tác cần ghi nhận thời gian, người thực hiện và lý do.

Tình trạng thực tế được đề xuất như sau:

| Trạng thái | Ý nghĩa |
|---|---|
| `READY` | Sẵn sàng tiếp nhận |
| `OCCUPIED` | Đang có lượt phục vụ thực tế |
| `CLEANING` | Đang vệ sinh hoặc chuẩn bị |
| `OUT_OF_SERVICE` | Tạm ngừng sử dụng |

Tình trạng hiện tại được quản lý riêng với lịch đặt trong tương lai. Một chỗ đang có thú cưng vẫn có thể nhận booking cho thời gian sau, nếu khoảng đặt mới không xung đột và có đủ thời gian chuẩn bị.

Khi check-out, tài nguyên chuyển sang `CLEANING`. Nhân viên xác nhận hoàn tất vệ sinh trước khi chuyển về `READY`. Hệ thống không cho đánh dấu tài nguyên đang có lượt phục vụ thành sẵn sàng để tiếp nhận thêm.

Khi tạo khoảng tạm ngừng, hệ thống kiểm tra các booking bị ảnh hưởng. Trường hợp xung đột phải được giải quyết trước khi áp dụng, thay vì âm thầm làm mất chỗ của khách đã được xác nhận.

**Kết quả nghiệp vụ:** hệ thống xác định được tài nguyên có thể nhận đặt và tài nguyên đủ điều kiện tiếp nhận thực tế.

### 5.2 Đặt lịch chăm sóc và lưu trú

Khách chọn thú cưng, dịch vụ và thời gian. Backend kiểm tra quyền sở hữu, điều kiện áp dụng, giờ hoạt động và tài nguyên khả dụng.

Giá được tính ở máy chủ theo phiên bản do Catalog cung cấp khi lập báo giá cho booking. Booking lưu đơn giá, số lượng hoặc số đêm, tổng tiền, mã phiên bản giá, thời lượng và thông tin dịch vụ tại thời điểm đặt. Sau khi booking được tạo, bảng giá mới không làm thay đổi các dữ liệu giá đã chốt này.

Với dịch vụ chăm sóc, hệ thống phân bổ một vị trí trong khoảng thời gian cần thiết. Mỗi vị trí đại diện cho một suất phục vụ mà cơ sở đã chuẩn bị đủ năng lực vận hành.

Với lưu trú, hệ thống cấp một chỗ phù hợp trong toàn bộ khoảng nhận đến trả, có xét thời gian vệ sinh hoặc chuẩn bị.

Booking được giữ chỗ trong 15 phút để chờ thanh toán. Khách có thể xem booking, thời hạn giữ chỗ, kết quả thanh toán và điều kiện hủy.

Phiên bản đầu không cho phép các booking đang hiệu lực của cùng một thú cưng chồng lấn thời gian. Trường hợp kết hợp chăm sóc trong kỳ lưu trú thuộc hướng phát triển sau.

**Kết quả nghiệp vụ:** tạo được booking gắn với phân bổ hợp lệ và mức giá đã chốt.

### 5.3 Thanh toán và đối chiếu giao dịch

Payment tạo yêu cầu thanh toán từ booking hợp lệ. Số tiền được lấy từ tổng tiền đã chốt của Booking, không nhận trực tiếp số tiền do frontend quyết định và không tính lại bằng bảng giá mới nhất trong Catalog. Giá trên booking đang giữ chỗ còn hiệu lực được giữ nguyên trong thời hạn 15 phút.

Mỗi lần thử thanh toán có mã tham chiếu riêng. Khi nhận kết quả, Payment kiểm tra chữ ký, mã tham chiếu, số tiền và kết quả giao dịch trước khi cập nhật.

Return URL phục vụ hiển thị kết quả cho khách. IPN là đường nhận thông báo giữa máy chủ; thông báo phải được kiểm tra trước khi sử dụng để cập nhật dữ liệu [5].

Payment phải xử lý được:

1. Thông báo kết quả gửi lặp.
2. Khách đóng trình duyệt sau khi thanh toán.
3. Giao dịch timeout hoặc chưa rõ kết quả.
4. Thanh toán thành công khi Booking đang tạm ngừng.
5. Thanh toán thành công sau khi booking đã hết hạn.

Timeout không được tự động coi là giao dịch thất bại. Hệ thống giữ trạng thái chưa xác định và thực hiện đối chiếu.

Nếu booking đã hết hạn hoặc chỗ đã được cấp lại, hệ thống vẫn ghi nhận giao dịch thành công nhưng không tự khôi phục booking cũ. Trường hợp này được chuyển sang danh sách ngoại lệ để xử lý.

Bản đầu quản lý yêu cầu hoàn tiền và bằng chứng xử lý thủ công. Trạng thái yêu cầu hoàn tiền được theo dõi riêng với trạng thái giao dịch thanh toán.

**Kết quả nghiệp vụ:** xác định được giao dịch đã được kiểm chứng và đồng bộ kết quả sang Booking một cách có thể phục hồi.

### 5.4 Tiếp nhận, chăm sóc và bàn giao

Nhân viên chỉ tiếp nhận booking đã xác nhận, đúng điều kiện thời gian và có tài nguyên thực tế sẵn sàng.

Phiếu tiếp nhận ghi tình trạng ban đầu, hướng dẫn chăm sóc và đồ dùng khách bàn giao. Thông tin quan trọng được lưu theo lượt phục vụ để việc sửa hồ sơ thú cưng sau đó không làm thay đổi lịch sử tiếp nhận.

Trong quá trình phục vụ, nhân viên ghi các hoạt động như tắm, cho ăn, vệ sinh, nghỉ ngơi và chuẩn bị bàn giao. Mỗi mục có thời gian và người cập nhật. Việc sửa thông tin cần được lưu dấu vết.

Khi check-out, nhân viên xác nhận người nhận, đồ dùng trả lại và ghi chú cuối lượt. Booking được hoàn tất, còn tài nguyên chuyển sang chờ vệ sinh.

Chủ thú cưng chỉ xem phiếu và nhật ký thuộc các lượt phục vụ của mình.

**Kết quả nghiệp vụ:** có đầy đủ thông tin từ lúc nhận thú cưng đến khi bàn giao.

### 5.5 Chức năng hỗ trợ

Đăng ký, đăng nhập, làm mới phiên, phân quyền, hồ sơ người dùng, tìm kiếm, logging và tài liệu API là chức năng hỗ trợ. Các chức năng này không được dùng thay cho bốn nghiệp vụ cốt lõi.

Hồ sơ thú cưng cung cấp dữ liệu đầu vào cho đặt lịch và chăm sóc, gồm tên, loài, giống, ngày sinh hoặc tuổi, cân nặng và ghi chú cần thiết. Hồ sơ đã có lịch sử được ngừng sử dụng thay vì xóa làm mất liên kết.

## 6. Quy tắc nghiệp vụ và trạng thái

### 6.1 Quy tắc nghiệp vụ

| Mã | Quy tắc |
|---|---|
| BR01 | Mỗi booking dành cho một thú cưng và một dịch vụ hoặc một lượt lưu trú |
| BR02 | Chỉ tạo booking cho thú cưng thuộc sở hữu của người đặt |
| BR03 | Giữ chỗ tối đa 15 phút kể từ khi tạo booking |
| BR04 | Giá tính tại backend và lưu bằng số nguyên VND |
| BR05 | Thanh toán toàn bộ trước khi xác nhận booking |
| BR06 | Lưu trú tính theo số đêm, tối thiểu một đêm |
| BR07 | Khoảng phân bổ phải xét thời gian chuẩn bị hoặc vệ sinh |
| BR08 | Không cấp trùng tài nguyên trong các khoảng thời gian xung đột |
| BR09 | Booking chưa thanh toán có thể được hủy để giải phóng chỗ |
| BR10 | Khách được hủy booking đã xác nhận khi còn ít nhất 24 giờ trước thời điểm bắt đầu và chưa check-in |
| BR11 | Hủy đủ điều kiện tạo yêu cầu hoàn tiền; việc hoàn tất yêu cầu cần bằng chứng xử lý |
| BR12 | Đổi lịch trong bản đầu thực hiện bằng hủy hợp lệ rồi tạo booking mới |
| BR13 | Check-in yêu cầu booking đã xác nhận và tài nguyên thực tế sẵn sàng |
| BR14 | Booking đã check-in không được khách tự hủy |
| BR15 | Check-out chuyển tài nguyên sang chờ vệ sinh |
| BR16 | Nhân viên không sửa giá đã chốt hoặc ghi đè kết quả thanh toán |
| BR17 | Chỉ nhân viên có `UPDATE_SERVICE_PRICE` được cập nhật bảng giá; quyền được gán qua script khởi tạo |
| BR18 | Mỗi thay đổi giá tạo phiên bản mới, lưu giá cũ, giá mới, người thực hiện, thời gian và lý do |
| BR19 | Booking đã tạo giữ nguyên đơn giá và tổng tiền; booking hết hạn phải tạo mới theo báo giá hiện hành |
| BR20 | Khi phiên bản giá khách đang xem khác báo giá backend, khách phải xác nhận lại trước khi tạo booking |
| BR21 | Payment thu theo tổng tiền đã chốt của Booking; không lấy giá mới từ Catalog để sửa giao dịch |
| BR22 | Giá là số nguyên VND lớn hơn 0; cập nhật từ phiên bản giá đã cũ phải bị từ chối để tránh ghi đè |

Thời điểm được lưu theo UTC và chuyển sang giờ Việt Nam khi hiển thị. Ngày lưu trú và giờ nhận, trả được diễn giải theo lịch của cơ sở.

Điều kiện hết hạn phải được kiểm tra khi xử lý yêu cầu, kể cả khi worker chưa kịp cập nhật trạng thái. Một booking đã quá thời hạn giữ chỗ không được tiếp tục xác nhận chỉ vì tác vụ nền chạy chậm.

### 6.2 Trạng thái booking

| Trạng thái | Ý nghĩa |
|---|---|
| `PENDING_PAYMENT` | Đang giữ chỗ chờ thanh toán |
| `CONFIRMED` | Đã xác nhận booking |
| `CHECKED_IN` | Đã tiếp nhận, đang phục vụ |
| `COMPLETED` | Đã bàn giao, hoàn tất |
| `CANCELLED` | Đã hủy |
| `EXPIRED` | Đã hết hạn giữ chỗ |

Các chuyển trạng thái chính:

1. `PENDING_PAYMENT` sang `CONFIRMED` khi Booking chấp nhận kết quả thanh toán hợp lệ trong thời hạn.
2. `PENDING_PAYMENT` sang `CANCELLED` khi khách hủy hợp lệ.
3. `PENDING_PAYMENT` sang `EXPIRED` khi hết thời hạn giữ chỗ.
4. `CONFIRMED` sang `CANCELLED` khi đáp ứng chính sách hủy.
5. `CONFIRMED` sang `CHECKED_IN` khi tiếp nhận hợp lệ.
6. `CHECKED_IN` sang `COMPLETED` khi bàn giao.

Booking quản lý các chuyển trạng thái. Các service khác gửi yêu cầu hoặc thông báo qua API, không trực tiếp sửa database của Booking.

### 6.3 Trạng thái thanh toán và hoàn tiền

Thanh toán có ba trạng thái cơ bản: `PENDING`, `SUCCEEDED` và `FAILED`. `PENDING` bao gồm trường hợp chưa có kết quả cuối; `SUCCEEDED` chỉ được ghi nhận sau xác minh; `FAILED` chỉ được sử dụng khi có căn cứ xác định thất bại.

Thông báo đến muộn hoặc gửi lại không được làm mất kết quả thành công đã được kiểm chứng.

Yêu cầu hoàn tiền có vòng đời riêng, đề xuất gồm `REQUESTED`, `PROCESSING`, `COMPLETED` và `REJECTED`. Tạo yêu cầu không đồng nghĩa đã hoàn tiền.

### 6.4 Chính sách cập nhật bảng giá

Nhân viên được ủy quyền chọn dịch vụ, xem giá hiện tại, nhập giá mới và lý do rồi xác nhận. Catalog lưu phiên bản mới và lịch sử trong cùng transaction. Giá mới có hiệu lực ngay cho các lần lập báo giá tiếp theo; phiên bản cũ được giữ để truy vết. Bản đầu chưa lập lịch áp dụng giá ở một ngày trong tương lai.

| Tình huống | Chính sách áp dụng giá |
|---|---|
| Đang xem dịch vụ, chưa tạo booking | Backend kiểm tra lại phiên bản khi khách đặt; giá thay đổi thì trả báo giá mới để khách xác nhận |
| `PENDING_PAYMENT` còn thời hạn | Giữ giá đã chốt đến khi hết thời hạn giữ chỗ 15 phút |
| `CONFIRMED`, `CHECKED_IN` hoặc `COMPLETED` | Giữ nguyên giá của booking và lịch sử giao dịch |
| Booking đã `EXPIRED`, khách đặt lại | Tạo booking mới theo báo giá hiện hành |
| Hai yêu cầu cùng sửa một phiên bản giá | Chấp nhận một cập nhật; yêu cầu dùng phiên bản cũ phải tải lại và xác nhận |

**Ví dụ:** khách A tạo booking lúc 09:00 với giá 150.000 VND và được giữ chỗ đến 09:15. Lúc 09:05, nhân viên cập nhật bảng giá thành 170.000 VND. A thanh toán lúc 09:10 vẫn trả 150.000 VND. Khách B nhận báo giá sau lần cập nhật sẽ thấy 170.000 VND. Nếu booking của A hết hạn, A tạo booking mới theo báo giá hiện hành.

## 7. Công nghệ và kiến trúc hệ thống

### 7.1 Công nghệ dự kiến

| Thành phần | Lựa chọn |
|---|---|
| Backend | FastAPI, REST API qua HTTP |
| Truy cập dữ liệu | SQLAlchemy và driver MySQL phù hợp |
| Database | MySQL với InnoDB |
| Frontend | HTML, CSS và JavaScript |
| Xác thực | JWT và cơ chế làm mới phiên |
| Tích hợp | VNPAY Sandbox |
| Triển khai | Docker Compose |
| Tác vụ nền | Worker xử lý hết hạn, thông báo cần gửi và đối chiếu |

FastAPI không bắt buộc một database hoặc thư viện truy cập dữ liệu cụ thể; lựa chọn MySQL và SQLAlchemy phù hợp với hướng triển khai của đề tài [1].

Docker Compose được sử dụng để định nghĩa và chạy các thành phần, mạng và volume của ứng dụng trong môi trường demo [2].

### 7.2 Sáu service dự kiến

| Service | Database sở hữu | Trách nhiệm |
|---|---|---|
| Auth | `auth_db` | Tài khoản, hai vai trò, quyền `UPDATE_SERVICE_PRICE` và phiên đăng nhập |
| Pet | `pet_db` | Hồ sơ thú cưng và thông tin chủ sở hữu |
| Catalog | `catalog_db` | Danh mục, thời lượng, điều kiện dịch vụ, phiên bản giá và lịch sử cập nhật giá |
| Booking | `booking_db` | Tài nguyên, khoảng tạm ngừng, booking, phân bổ, bản sao giá và vòng đời phục vụ |
| Payment | `payment_db` | Lần thử thanh toán, kết quả, đối chiếu, yêu cầu hoàn tiền và thông báo cần đồng bộ |
| Care | `care_db` | Phiếu tiếp nhận, nhật ký và thông tin bàn giao |

API Gateway là điểm tiếp nhận và định tuyến yêu cầu từ frontend. Mỗi service tiếp tục kiểm tra quyền đối với dữ liệu mình bảo vệ.

Các service không truy cập trực tiếp database của nhau. Liên kết xuyên service sử dụng ID và API nội bộ; khóa ngoại chỉ được tạo trong database thuộc cùng service.

Môi trường demo có thể sử dụng một máy chủ MySQL với sáu database và tài khoản truy cập riêng. Đây là tách quyền sở hữu dữ liệu ở mức logic. Việc dùng chung máy chủ vật lý vẫn phù hợp nếu các service không dùng chung bảng hoặc truy cập chéo schema [3].

### 7.3 Xử lý đặt chỗ đồng thời

Booking thực hiện kiểm tra và cấp phát trong transaction. Phương án dự kiến sử dụng khóa trên bản ghi tài nguyên ổn định, đọc lại các phân bổ hiện hành rồi tạo booking và phân bổ nếu không xung đột.

Không chỉ kiểm tra khả dụng tại frontend hoặc thực hiện chuỗi đọc rồi ghi bằng `SELECT` thông thường. MySQL lưu ý rằng `SELECT` thông thường không bảo vệ đầy đủ cho trường hợp đọc dữ liệu rồi cập nhật liên quan [4].

Các luồng tạo, hủy, hết hạn và điều chỉnh khả dụng phải tuân theo cùng quy tắc phối hợp dữ liệu. Việc ngăn trùng thời gian của cùng thú cưng cũng được kiểm soát trong Booking.

### 7.4 Đồng bộ Payment với Booking

Phương án thiết kế sử dụng Outbox kết hợp worker:

1. Payment xác minh thông báo từ cổng thanh toán.
2. Trong một transaction, Payment lưu kết quả và bản ghi thông báo cần gửi.
3. Worker gửi thông báo đến API nội bộ của Booking.
4. Booking kiểm tra mã thông báo, trạng thái và thời hạn trước khi xác nhận.
5. Nếu gửi lỗi, worker thử lại từ dữ liệu đã lưu.
6. Thông báo gửi lặp chỉ tạo một tác động nghiệp vụ.
7. Nếu booking đã hết hạn hoặc không thể xác nhận, kết quả được ghi nhận để xử lý ngoại lệ.

Worker thuộc service nào chỉ truy cập database của service đó. Việc gửi sang service khác được thực hiện qua API.

### 7.5 Đồng bộ Booking với Care

Booking là nguồn quyết định trạng thái `CHECKED_IN` và `COMPLETED`. Care sở hữu thông tin chi tiết của phiếu tiếp nhận, nhật ký và bàn giao.

Yêu cầu tiếp nhận hoặc bàn giao được nhận diện bằng mã duy nhất và lưu bền vững trước khi thực hiện chuỗi cập nhật. Nếu một bước bị lỗi, hệ thống có thể đối chiếu và tiếp tục xử lý theo cùng mã yêu cầu.

Khi Booking đã chấp nhận chuyển trạng thái nhưng Care chưa đồng bộ xong, giao diện hiển thị trạng thái đang đồng bộ. Việc thử lại không được tạo nhiều phiếu tiếp nhận hoặc nhiều lần bàn giao.

### 7.6 Lý do lựa chọn microservices

Một ứng dụng nguyên khối có thể đáp ứng quy mô một cơ sở. Đề tài lựa chọn microservices để thực hành ranh giới nghiệp vụ, quyền sở hữu dữ liệu, hợp đồng API và phục hồi sau lỗi giữa các thành phần.

Chi phí của lựa chọn này là triển khai, kiểm thử và đồng bộ phức tạp hơn. Vì vậy, phiên bản đầu giới hạn tính năng và sử dụng worker cùng API nội bộ; Kubernetes và message broker chưa thuộc phạm vi.

### 7.7 Phối hợp service khi thay đổi giá

Auth quản lý quyền `UPDATE_SERVICE_PRICE` trong dữ liệu tài khoản. Quyền được lấy từ dữ liệu phía máy chủ khi cấp hoặc làm mới token; Catalog xác minh token và kiểm tra quyền trước khi cho ghi giá. Việc kiểm tra quyền luôn được thực hiện tại API, kể cả khi người dùng gọi trực tiếp ngoài giao diện. FastAPI hỗ trợ kiểm tra quyền chi tiết tại API [7].

Catalog sở hữu phiên bản giá. API cập nhật nhận giá mới, lý do và `expected_price_version`. Nếu phiên bản hiện hành đã thay đổi, API trả xung đột 409; không tự ghi đè. Khi hợp lệ, tạo phiên bản mới và bản ghi lịch sử gồm giá cũ, giá mới, người thực hiện và thời gian phía máy chủ.

Khi tạo booking, Booking gọi Catalog lấy báo giá phía máy chủ và so sánh phiên bản với phiên bản khách đã xem. Nếu khác, trả `PRICE_CHANGED` kèm báo giá mới để khách xác nhận, chưa cấp giữ chỗ. Khi phiên bản khớp, Booking chốt bản sao báo giá do máy chủ cung cấp và tạo booking cùng phân bổ. Mốc chọn giá là lần lập báo giá này; không yêu cầu một transaction xuyên hai database Catalog và Booking.

Booking lưu `service_id`, `price_version_id`, `unit_price`, `quantity` hoặc `nights`, `total_amount` và `currency`. Payment chỉ lấy `total_amount` và `currency` qua API nội bộ của Booking. Catalog đổi giá trong lúc khách thanh toán không làm Payment đổi số tiền của booking đã tạo.

## 8. Giao diện tối thiểu

### 8.1 Giao diện Chủ thú cưng

1. Đăng ký, đăng nhập và thông tin tài khoản.
2. Danh sách, tạo và chỉnh sửa hồ sơ thú cưng.
3. Danh mục dịch vụ, giá và điều kiện áp dụng.
4. Chọn thời gian và tạo booking.
5. Danh sách, chi tiết và thời hạn giữ chỗ.
6. Thanh toán và theo dõi kết quả.
7. Hủy booking theo điều kiện.
8. Xem lịch sử và nhật ký chăm sóc.

### 8.2 Giao diện Nhân viên

1. Đăng nhập bằng tài khoản được khởi tạo sẵn.
2. Lịch đến, đang phục vụ và dự kiến bàn giao.
3. Tình trạng tài nguyên và khoảng tạm ngừng.
4. Phiếu tiếp nhận và thao tác check-in.
5. Ghi và xem nhật ký chăm sóc.
6. Phiếu bàn giao và check-out.
7. Danh sách giao dịch cần đối chiếu và yêu cầu hoàn tiền.
8. Lịch sử thao tác vận hành liên quan.
9. Cập nhật bảng giá và xem lịch sử thay đổi, chỉ dành cho nhân viên được ủy quyền.

Màn hình đổi giá hiển thị giá cũ, giá mới, lý do và bước xác nhận. Giao diện chỉ hiển thị thao tác ghi giá khi có quyền; backend vẫn kiểm tra độc lập. Khi khách tạo booking bằng phiên bản cũ, giao diện trình bày giá mới và yêu cầu khách xác nhận lại.

Các màn hình cần thể hiện rõ trạng thái đang xử lý, lỗi có thể thử lại và trường hợp cần nhân viên xử lý. Không hiển thị kết quả thanh toán thành công chỉ dựa vào dữ liệu trên URL trình duyệt.

## 9. Kiểm thử và tiêu chí nghiệm thu

| Tình huống | Kết quả cần đạt |
|---|---|
| Luồng thông thường | Tạo hồ sơ, đặt, thanh toán, tiếp nhận, chăm sóc và bàn giao thành công |
| Hai khách đặt cùng chỗ trong khoảng xung đột | Chỉ một booking được cấp khoảng đó |
| Hai booking cùng thú cưng chồng lấn | Yêu cầu không hợp lệ bị từ chối |
| Booking hết hạn | Chuyển `EXPIRED` và giải phóng phân bổ theo quy tắc |
| Worker cập nhật hết hạn bị chậm | Yêu cầu xác nhận vẫn kiểm tra thời hạn thực tế |
| Khách sửa số tiền ở frontend | Backend sử dụng giá đã chốt |
| IPN gửi lặp | Không tạo thêm tác động thanh toán hoặc xác nhận |
| Chữ ký sai hoặc số tiền không khớp | Không xác nhận booking |
| Thanh toán thành công sau khi booking hết hạn | Giữ kết quả giao dịch; chuyển xử lý ngoại lệ |
| Booking tạm ngừng khi Payment đã nhận kết quả | Kết quả được lưu và đồng bộ lại khi phục hồi |
| Hủy và check-in đồng thời | Chỉ một chuyển trạng thái hợp lệ được chấp nhận |
| Đoán ID của khách khác | Không xem hoặc sửa dữ liệu ngoài quyền |
| Tài nguyên chưa vệ sinh xong | Không tiếp nhận lượt mới khi chưa sẵn sàng |
| Tạo khoảng tạm ngừng xung đột | Phát hiện booking bị ảnh hưởng trước khi áp dụng |
| Khách gửi yêu cầu tự cấp vai trò nhân viên | Bị từ chối tại backend |
| Khách hoặc nhân viên thường gọi API đổi giá | Bị từ chối; không tạo phiên bản hoặc lịch sử giá thành công |
| Nhân viên được ủy quyền đổi giá hợp lệ | Có phiên bản mới và lịch sử giá cũ, giá mới, người, thời gian, lý do |
| Giá âm, bằng 0, có phần lẻ hoặc thiếu lý do | Từ chối; giữ nguyên giá và phiên bản hiện hành |
| Hai yêu cầu cập nhật cùng `expected_price_version` | Chỉ một yêu cầu thành công; yêu cầu còn lại nhận xung đột |
| Khách đặt bằng phiên bản đã cũ | Thông báo `PRICE_CHANGED`; khách xác nhận lại trước khi tạo booking |
| Đổi bảng giá khi booking đang giữ chỗ | Booking còn hiệu lực và Payment giữ nguyên tổng tiền đã chốt |
| Booking hết hạn sau khi bảng giá đổi | Booking đặt lại dùng báo giá hiện hành |
| Khởi động hoặc chạy lại seed trên dữ liệu đã có | Không ghi đè phiên bản giá hoặc làm mất lịch sử cập nhật |

Bằng chứng kiểm thử gồm phản hồi API, trạng thái dữ liệu liên quan, log và ảnh giao diện phù hợp. Báo cáo phân biệt rõ trường hợp đã kiểm thử, lỗi còn tồn tại và giới hạn của phiên bản.

## 10. Kế hoạch thực hiện

### 10.1 Phân công service cho hai người

Người 1 phụ trách Auth, Pet và Booking. Người 2 phụ trách Catalog, Payment và Care. Mỗi người thực hiện database, migration, seed, API, giao diện liên quan, Dockerfile, kiểm thử và tài liệu cho phần mình. Booking nặng về phân bổ và đồng thời; Payment nặng về tích hợp và phục hồi; Catalog có thêm cập nhật giá và lịch sử nên cần được tính là một phần việc đầy đủ.

| Phụ trách | Service và dữ liệu | Đầu ra phải bàn giao |
|---|---|---|
| Người 1 | Auth / `auth_db` | Đăng ký khách, đăng nhập, làm mới phiên, JWT và quyền; seed tài khoản STAFF thường và STAFF có quyền đổi giá |
| Người 1 | Pet / `pet_db` | Hồ sơ thú cưng, quyền sở hữu, ngừng sử dụng hồ sơ; API phục vụ kiểm tra khi đặt và chăm sóc |
| Người 1 | Booking / `booking_db` | Tài nguyên, khả dụng, chống trùng, giữ chỗ 15 phút, hủy/hết hạn, bản sao giá; API nhận kết quả Payment và lệnh từ Care |
| Người 2 | Catalog / `catalog_db` | Danh mục, báo giá có phiên bản; API và màn hình đổi giá, kiểm tra quyền, chống cập nhật đè và lịch sử thay đổi |
| Người 2 | Payment / `payment_db` | Sandbox, IPN, đối chiếu, chống xử lý lặp, Outbox/worker; thu đúng giá Booking và theo dõi yêu cầu hoàn tiền |
| Người 2 | Care / `care_db` | Tiếp nhận, nhật ký, bàn giao; lưu yêu cầu bền vững, đồng bộ trạng thái với Booking và chống tạo phiếu lặp |

### 10.2 Giao diện và công việc tích hợp

| Hạng mục | Người 1 | Người 2 |
|---|---|---|
| Giao diện khách | Khung giao diện, đăng nhập, hồ sơ, chọn lịch, tạo/xem/hủy booking; xử lý xác nhận lại khi giá đổi | Danh mục và giá, thanh toán/kết quả, lịch sử giao dịch và nhật ký chăm sóc cho khách |
| Giao diện nhân viên | Lịch booking, tình trạng tài nguyên, vệ sinh và khoảng tạm ngừng | Tiếp nhận, nhật ký, bàn giao, đối chiếu/hoàn tiền; đổi giá và lịch sử theo quyền |
| Tác vụ nền | Hết hạn giữ chỗ; các tác vụ đồng bộ thuộc Booking | Outbox/đối chiếu Payment; phục hồi các yêu cầu thuộc Care |
| Gateway và Docker Compose | Chủ trì cấu hình Gateway, mạng, database và Compose; thống nhất cổng và biến cấu hình | Cung cấp Dockerfile, healthcheck và cấu hình cần thiết cho ba service; cùng kiểm tra khởi động |
| Hợp đồng API và bảo mật | Chủ trì cấu trúc JWT, mã lỗi chung và hợp đồng API Booking | Chủ trì hợp đồng giá Catalog, thông báo Payment và yêu cầu Care |
| Báo cáo và trình bày | ERD, API, luồng và bằng chứng kiểm thử Auth/Pet/Booking; tổng hợp tài liệu kiến trúc | ERD, API, luồng và bằng chứng Catalog/Payment/Care; tổng hợp kịch bản demo |
| Kiểm thử tích hợp | Cùng chạy luồng đầy đủ, thử lỗi và rà quyền | Cùng chạy luồng đầy đủ, thử lỗi và rà quyền |

Gateway và Docker Compose được dựng khung từ tuần đầu. Mỗi service có thể chạy độc lập với dữ liệu giả lập theo hợp đồng đã chốt khi API bên kia chưa hoàn tất; các thay đổi hợp đồng phải được cả hai thống nhất và cập nhật tài liệu trước khi sử dụng.

### 10.3 Lộ trình tham chiếu bốn tuần

Lộ trình dùng các mốc tuần tương đối để nhóm sắp xếp theo hạn nộp. Mỗi tuần chốt một đầu ra có thể trình diễn. Các bài kiểm thử và tài liệu của từng service được cập nhật cùng lúc với chức năng.

| Mốc | Người 1 | Người 2 | Mốc nghiệm thu chung |
|---|---|---|---|
| Tuần 1 | Khung dự án/Gateway/Compose; Auth, JWT, seed quyền; Pet và giao diện hồ sơ | Catalog và seed giá; hợp đồng báo giá/đổi giá; chuẩn bị tài khoản sandbox và thử cấu hình kết nối | Cùng chốt API và dữ liệu. Chạy được nền tảng; đăng nhập hai vai trò; có STAFF thường và STAFF được đổi giá |
| Tuần 2 | Booking, phân bổ, chống trùng, TTL; chốt giá và `PRICE_CHANGED`; API nhận thông báo thanh toán | Đổi giá, lịch sử và xung đột phiên bản; Payment, IPN, đối chiếu và Outbox; giao diện thanh toán | Khách tạo booking và trả đúng tiền. Đổi bảng giá không đổi booking cũ; API ghi giá kiểm tra quyền |
| Tuần 3 | Tài nguyên thực tế, vệ sinh, khoảng tạm ngừng; chuyển trạng thái check-in/check-out; giao diện lịch | Care: phiếu nhận, nhật ký, bàn giao; worker phục hồi; giao diện vận hành và xử lý ngoại lệ | Chạy trọn luồng từ hồ sơ đến bàn giao; Care và Booking đồng bộ, yêu cầu gửi lại không tạo phiếu trùng |
| Tuần 4 | Kiểm thử đồng thời, quyền sở hữu, hết hạn và giá; hoàn thiện Compose, hướng dẫn chạy và tài liệu phần mình | Kiểm thử IPN lặp/sai, thanh toán muộn, retry và đổi giá; hoàn thiện tài liệu phần mình và kịch bản demo | Hai người cùng kiểm thử khi service lỗi/phục hồi, kiểm tra cài đặt từ dữ liệu sạch và tập trình bày |

### 10.4 Các hợp đồng phải thống nhất trước khi tích hợp

| Luồng | Người 1 chịu trách nhiệm | Người 2 chịu trách nhiệm |
|---|---|---|
| JWT và quyền | Auth phát hành `sub`, `role`, `permissions` từ dữ liệu máy chủ; seed quyền `UPDATE_SERVICE_PRICE` | Catalog/Payment/Care xác minh token và quyền theo thao tác; Catalog kiểm tra quyền ghi giá |
| Booking gọi Catalog | Gửi `service_id` và thông tin cần báo giá; đối chiếu `price_version_id` khách đã xem; lưu bản sao giá | Trả `price_version_id`, `unit_price`, `currency`, thời lượng và điều kiện; xử lý `expected_price_version` khi cập nhật |
| Payment báo Booking | API nhận `event_id`, `booking_id`, `payment_id`, `amount`, `currency`; kiểm tra trùng, thời hạn và chuyển trạng thái | Xác minh thanh toán; lưu Outbox và gửi lại theo `event_id`; ghi nhận kết quả tiếp nhận hoặc ngoại lệ |
| Care yêu cầu Booking | Booking quyết định chuyển trạng thái, chống đua với hủy và cập nhật tài nguyên | Care lưu phiếu/yêu cầu theo `request_id`; gọi API, đối chiếu và phục hồi; giao diện hiển thị đang đồng bộ |
| Quy ước chung | Cùng chốt ID, UTC, số nguyên VND, trạng thái, định dạng lỗi và xác thực API nội bộ | Cùng chốt ví dụ request/response; 401/403 cho xác thực/quyền, 409 cho xung đột và `PRICE_CHANGED` |

Booking là nguồn quyết định trạng thái booking và tổng tiền đã chốt. Catalog là nguồn quyết định bảng giá. Payment là nguồn kết quả giao dịch đã xác minh. Care là nguồn dữ liệu phiếu và nhật ký. Mỗi bên cung cấp API của mình và không đọc hoặc sửa database của bên kia.

### 10.5 Điều kiện bàn giao giữa hai người

1. Mỗi service có migration/seed, cấu hình mẫu, Dockerfile, OpenAPI, ví dụ API và hướng dẫn chạy độc lập; seed chạy lại không xóa hoặc ghi đè dữ liệu nghiệp vụ đã phát sinh.
2. Người 1 bàn giao bằng chứng đăng nhập/phân quyền, quyền sở hữu thú cưng, đặt trùng, giữ chỗ hết hạn, hủy/check-in đồng thời và giữ nguyên giá booking khi Catalog đổi giá.
3. Người 2 bàn giao bằng chứng đổi giá đúng quyền và lịch sử, xung đột phiên bản giá, IPN lặp/sai, Outbox thử lại, thanh toán đến muộn và phiếu Care không bị nhân đôi.
4. Hai người cùng chạy bộ tiêu chí mục 9, luồng demo mục 11 và khởi động hệ thống qua Docker Compose. Mỗi người giải thích sâu phần mình và nắm được luồng tổng thể khi bảo vệ.

## 11. Sản phẩm bàn giao và kịch bản trình diễn

### 11.1 Sản phẩm bàn giao

1. Bản đề xuất đồ án và tài liệu yêu cầu.
2. Tài liệu kiến trúc gồm use case, thành phần, triển khai, trình tự các luồng chính và ERD theo từng database.
3. Mã nguồn frontend và sáu service.
4. Migration, script khởi tạo và dữ liệu mẫu.
5. Dockerfile, Docker Compose, cấu hình mẫu và hướng dẫn chạy.
6. Tài liệu OpenAPI và bộ yêu cầu API mẫu.
7. Báo cáo kiểm thử, bằng chứng tích hợp sandbox và các giới hạn đã xác định.
8. Slide, kịch bản demo và video nếu môn học yêu cầu.

### 11.2 Kịch bản trình diễn chính

Khách tạo hồ sơ mèo, chọn hai đêm lưu trú và nhận mức giá từ hệ thống. Booking giữ một chỗ phù hợp trong thời hạn thanh toán. Sau khi Payment xác minh thành công và Booking xác nhận, nhân viên tiếp nhận, ghi tình trạng ban đầu và cập nhật nhật ký. Chủ theo dõi quá trình trên web. Nhân viên bàn giao, hoàn tất booking và chuyển chỗ sang chờ vệ sinh.

### 11.3 Kịch bản kỹ thuật trọng tâm

1. Hai trình duyệt cùng đặt một tài nguyên để chứng minh chống cấp trùng.
2. Gửi lại cùng thông báo thanh toán để chứng minh xử lý lặp an toàn.
3. Tạm ngừng Booking khi Payment đã ghi nhận giao dịch, sau đó phục hồi để chứng minh cơ chế đồng bộ lại.
4. Thử truy cập booking hoặc nhật ký của khách khác để chứng minh kiểm tra quyền sở hữu.

### 11.4 Kịch bản đổi giá có kiểm soát

Đăng nhập bằng nhân viên thường và gọi thử API đổi giá để chứng minh bị từ chối. Nhân viên được ủy quyền đổi giá dịch vụ từ 150.000 lên 170.000 VND và xem lịch sử. Giữ một booking đã tạo ở mức 150.000 VND, thanh toán để chứng minh số tiền không đổi. Đặt booking mới theo mức 170.000 VND; thử phiên bản giá cũ để trình diễn bước xác nhận lại.

## 12. Tài liệu tham khảo

1. FastAPI. *SQL Relational Databases*.
2. Docker. *Docker Compose*.
3. Microsoft Learn. *Data considerations for microservices*.
4. MySQL. *Locking Reads*.
5. VNPAY. *Kết nối Cổng thanh toán VNPAY*.
6. OWASP. *Authorization Cheat Sheet*.
7. FastAPI. *OAuth2 scopes*.