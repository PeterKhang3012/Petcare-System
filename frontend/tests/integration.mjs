import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const base = process.env.PAWSTAY_TEST_URL;
if (!base) throw new Error('Đặt PAWSTAY_TEST_URL thành URL frontend trỏ vào stack kiểm thử riêng.');
const report = (message) => console.log('ĐẠT · ' + message);
const suffix = randomUUID().slice(0, 10);
const customer = { username: 'paw_' + suffix, password: 'PawStayDemo!42', confirm_password: 'PawStayDemo!42', full_name: 'Nguyễn An', phone: '0912345678' };
const second = { ...customer, username: 'paw_other_' + suffix };
const dateOffset = Number.parseInt(suffix.slice(0, 8), 16) % 190;
const day = offset => new Date(Date.now() + (dateOffset + offset) * 86400000).toISOString().slice(0, 10);
const root = fileURLToPath(new URL('../../', import.meta.url));

async function call(method, path, { body, token, key } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  if (key) headers['Idempotency-Key'] = key;
  const response = await fetch(base + '/api' + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual', signal: AbortSignal.timeout(37000)
  });
  const raw = await response.text();
  let value;
  try { value = JSON.parse(raw); } catch { value = raw; }
  return { status: response.status, value };
}
async function check(method, path, status, options) {
  const response = await call(method, path, options);
  assert.equal(response.status, status, method + ' ' + path.split('?')[0] + ' ' + JSON.stringify(response.value).slice(0, 180));
  return response.value;
}
const compose = (...args) => {
  const project = process.env.PAWSTAY_TEST_PROJECT;
  const override = process.env.PAWSTAY_TEST_OVERRIDE;
  assert(project?.endsWith('-check') && override, 'Chỉ dừng service trong project kiểm thử riêng có hậu tố -check.');
  execFileSync('docker', ['compose', '-p', project, '-f', 'docker-compose.yml', '-f', override, ...args], { cwd: root, stdio: 'inherit' });
};

async function browserFlow() {
  const browser = await chromium.launch(process.env.PAWSTAY_BROWSER_CHANNEL ? { channel: process.env.PAWSTAY_BROWSER_CHANNEL } : {});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/bookings/new');
    await page.waitForURL('**/login');
    await page.getByRole('link', { name: 'Đăng ký', exact: true }).click();
    await page.getByLabel('Họ và tên').fill(customer.full_name);
    await page.getByLabel('Số điện thoại').fill(customer.phone);
    await page.getByLabel('Tên đăng nhập').fill(customer.username);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(customer.password);
    await page.getByLabel('Xác nhận mật khẩu').fill(customer.confirm_password);
    await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
    await page.getByText('Tạo tài khoản thành công. Bạn có thể đăng nhập.').waitFor();
    await page.getByLabel('Tên đăng nhập').fill(customer.username);
    await page.getByLabel('Mật khẩu').fill(customer.password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByRole('heading', { name: 'Xin chào, ' + customer.username }).waitFor();
    await page.getByRole('link', { name: 'Tài khoản', exact: true }).click();
    await page.getByText(customer.full_name, { exact: true }).waitFor();
    await page.getByText(customer.phone, { exact: true }).waitFor();
    await page.getByRole('link', { name: 'Thú cưng', exact: true }).click();
    await page.getByRole('link', { name: 'Thêm thú cưng' }).click();
    await page.getByLabel('Tên thú cưng').fill('Miu ' + suffix);
    await page.locator('select[name="species"]').selectOption('CAT');
    await page.locator('select[name="coat_type"]').selectOption('SHORT');
    await page.getByLabel('Cân nặng').fill('4');
    await page.getByRole('button', { name: 'Lưu hồ sơ' }).click();
    await page.getByRole('heading', { name: 'Miu ' + suffix }).waitFor();
    const petId = page.url().split('/').pop();
    await page.getByRole('button', { name: 'Chỉnh sửa' }).click();
    await page.getByLabel('Cân nặng').fill('4.5');
    await page.getByRole('button', { name: 'Lưu hồ sơ' }).click();
    await page.getByText('4.5 kg', { exact: true }).waitFor();
    await page.getByRole('link', { name: 'Lịch đặt', exact: true }).click();
    await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Lưu trú', exact: true }).click();
    await page.waitForURL('**/bookings/boarding/new');
    await page.getByRole('heading', { name: 'Đặt lưu trú' }).waitFor();
    await page.getByLabel('Ngày nhận thú cưng').waitFor();
    await page.getByLabel('Ngày trả thú cưng').waitFor();
    assert.equal(await page.getByLabel('Ngày chăm sóc').count(), 0);
    await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Chăm sóc', exact: true }).click();
    await page.waitForURL('**/bookings/care/new');
    await page.getByLabel('Ngày chăm sóc').waitFor();
    assert.equal(await page.getByLabel('Ngày nhận thú cưng').count(), 0);
    await page.locator('select[name="pet"]').selectOption(petId);
    await page.getByLabel('Ngày chăm sóc').fill(day(3));
    await page.getByRole('radio', { name: /^09:00/ }).check();
    await page.getByRole('button', { name: 'Kiểm tra chỗ và báo giá' }).click();
    await page.getByRole('heading', { name: 'Báo giá' }).waitFor();
    await page.getByRole('button', { name: 'Xác nhận đặt lịch' }).click();
    await page.getByRole('heading', { name: 'Chi tiết lịch đặt' }).waitFor();
    await page.getByRole('heading', { name: 'Lịch sử thay đổi' }).waitFor();
    const bookingId = page.url().split('/').pop();
    let paymentId;
    if (process.env.PAWSTAY_TEST_VNPAY_SECRET) {
      const startPayment = page.getByRole('button', { name: 'Khởi tạo thanh toán' });
      const policyCheckbox = page.getByRole('checkbox', { name: /^Tôi đã đọc và đồng ý/ });
      assert.equal(await startPayment.isDisabled(), true);
      await policyCheckbox.check();
      await policyCheckbox.uncheck();
      assert.equal(await startPayment.isDisabled(), true);
      await policyCheckbox.check();
      await startPayment.click();
      await page.getByRole('link', { name: 'Thanh toán qua VNPAY' }).waitFor();
      await policyCheckbox.uncheck();
      assert.equal(await page.getByRole('button', { name: 'Thanh toán qua VNPAY' }).isDisabled(), true);
      assert.equal(await page.getByRole('link', { name: 'Thanh toán qua VNPAY' }).count(), 0);
      await policyCheckbox.check();
      paymentId = page.url().split('/').pop();
      const url = await page.getByRole('link', { name: 'Thanh toán qua VNPAY' }).getAttribute('href');
      assert.equal(new URL(url).searchParams.get('vnp_TxnRef'), paymentId.replaceAll('-', ''));
      await page.goto(base + '/payments/return?payment_id=' + paymentId + '&vnp_ResponseCode=00');
      await page.getByRole('heading', { name: 'Chi tiết thanh toán' }).waitFor();
      await page.getByText('Đang chờ', { exact: true }).waitFor();
      const resumePayment = page.getByRole('button', { name: 'Lấy lại liên kết VNPay' });
      assert.equal(await resumePayment.isDisabled(), true);
      await policyCheckbox.check();
      await resumePayment.click();
      await page.getByRole('link', { name: 'Thanh toán qua VNPAY' }).waitFor();
      report('Trình duyệt tạo Payment, tra cứu Return và lấy lại liên kết bằng cùng khóa');
    }
    await page.goto(base + '/staff');
    await page.getByRole('heading', { name: 'Không có quyền truy cập' }).waitFor();
    await page.getByRole('link', { name: 'Tài khoản', exact: true }).click();
    await page.getByRole('heading', { name: 'Tài khoản' }).waitFor();
    await page.reload();
    await page.getByRole('heading', { name: 'Tài khoản' }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await page.getByRole('heading', { name: 'Chào mừng trở lại' }).waitFor();
    await page.evaluate(() => sessionStorage.setItem('pawstay.session', 'invalid'));
    await page.goto(base + '/pets');
    await page.waitForURL('**/login');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('pawstay.session')), null);
    if (process.env.PAWSTAY_TEST_STAFF_USERNAME && process.env.PAWSTAY_TEST_STAFF_PASSWORD) {
      await page.getByLabel('Tên đăng nhập').fill(process.env.PAWSTAY_TEST_STAFF_USERNAME);
      await page.getByLabel('Mật khẩu').fill(process.env.PAWSTAY_TEST_STAFF_PASSWORD);
      await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
      await page.getByRole('link', { name: 'Vận hành', exact: true }).click();
      await page.getByRole('button', { name: 'Tài nguyên', exact: true }).click();
      await page.getByRole('button', { name: 'CARE-01', exact: true }).click();
      await page.getByRole('heading', { name: 'Lịch sử tài nguyên' }).waitFor();
      await page.getByRole('button', { name: 'Giao dịch', exact: true }).click();
      await page.getByRole('heading', { name: 'Giao dịch thanh toán' }).waitFor();
      await page.getByRole('button', { name: 'Hoàn tiền', exact: true }).click();
      await page.getByRole('heading', { name: 'Yêu cầu hoàn tiền' }).waitFor();
      await page.goto(base + '/staff/bookings/' + bookingId);
      await page.getByRole('heading', { name: 'Liên hệ khách hàng' }).waitFor();
      await page.getByRole('link', { name: customer.phone, exact: true }).waitFor();
      report('Giao diện STAFF mở được vận hành, giao dịch, hoàn tiền và liên hệ theo lịch đặt');
    }
    assert.deepEqual(errors, []);
    report('Trình duyệt đăng ký, đăng nhập, sửa thú cưng, đặt lịch, bảo vệ trang, tải lại phiên, bố cục 390 px và đăng xuất');
    return { petId, bookingId, paymentId };
  } finally { await browser.close(); }
}

// Focused UI regression mode: all API calls are intercepted; no application data is written.
async function demoClockBrowserFlow() {
  const browser = await chromium.launch(process.env.PAWSTAY_BROWSER_CHANNEL ? { channel: process.env.PAWSTAY_BROWSER_CHANNEL } : {});
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => sessionStorage.setItem('pawstay.session', 'demo-ui-test'));
    const id = 'a'.repeat(24), visitId = 'b'.repeat(24), start = new Date(Date.now() + 86400000);
    start.setUTCHours(2, 0, 0, 0);
    const end = new Date(+start + 3600000).toISOString(), calls = [], clocks = [], careBodies = [];
    let enabled = true, active = false, business = new Date().toISOString(), status = 'CONFIRMED', loseCare = false, receipt;
    const details = () => ({ booking: { id, pet_id: 'c'.repeat(24), service_id: 'bath', service_snapshot: { type: 'CARE' },
      start_at: start.toISOString(), end_at: end, status, accepted_payment_id: 'test-payment', total_amount: 200000, currency: 'VND' },
      resource: { id: 'd'.repeat(24), code: 'CARE-1', state: 'READY' },
      demo_clock: { enabled, is_demo: active, real_now: new Date().toISOString(), business_now: business, version: clocks.length,
        min_time: new Date(+start - 3600000).toISOString(), max_time: new Date(Date.parse(end) - 1).toISOString() } });
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
      const req = route.request(), path = new URL(req.url()).pathname.slice(4), body = req.method() === 'POST' ? req.postDataJSON() : undefined;
      const ok = data => route.fulfill({ json: { success: true, data } });
      if (path === '/auth/me') return ok({ user: { id: 'e'.repeat(24), username: 'demo-staff', role: 'STAFF', permissions: [] } });
      if (path.endsWith('/contact')) return ok({ contact: { full_name: 'Test owner', phone: '0900000000' } });
      if (path === '/staff/bookings/' + id) { calls.push('context'); return ok(details()); }
      if (path.endsWith('/demo-clock')) {
        calls.push('clock'); clocks.push({ body, key: req.headers()['idempotency-key'] });
        active = true; business = body.command === 'SET_TIME' ? body.time : start.toISOString();
        return ok(details());
      }
      if (path.endsWith('/check-in')) {
        calls.push('care'); careBodies.push(body);
        if (enabled) assert(active, 'The clock must be confirmed before Care receives a request');
        if (receipt?.request_id !== body.request_id) receipt = { request_id: body.request_id, visit_id: visitId, action: 'CHECK_IN', status: enabled ? 'SUCCEEDED' : 'REJECTED',
          ...(!enabled ? { result: { code: 'INVALID_BOOKING_STATE', message: 'Outside the configured check-in window' } } : {}) };
        if (loseCare) { loseCare = false; status = 'CHECKED_IN'; return route.abort('failed'); }
        return ok({ request: receipt, visit: { id: visitId, state: 'IN_CARE' } });
      }
      if (path.startsWith('/care/requests/')) return ok({ request: receipt });
      throw new Error('Unexpected demo UI request: ' + path);
    });
    const open = async () => { await page.goto(base + '/staff/bookings/' + id); await page.getByRole('heading', { name: 'Tiếp nhận thú cưng', exact: true }).waitFor(); };
    const fill = async () => { await page.getByLabel('Tình trạng lúc tiếp nhận').fill('Healthy'); await page.getByLabel('Lý do', { exact: true }).first().fill('Test reception'); };
    await open();
    await page.getByRole('button', { name: 'Xác nhận tiếp nhận (giờ demo)', exact: true }).click();
    assert.equal(clocks.length, 0); assert.equal(careBodies.length, 0);
    await fill();
    await page.getByRole('button', { name: 'Xác nhận tiếp nhận (giờ demo)', exact: true }).click();
    await page.waitForURL('**/care/requests/**');
    assert.deepEqual(calls.filter(value => value !== 'context'), ['clock', 'care']);
    assert.equal(clocks[0].body.command, 'TO_APPOINTMENT');
    assert.equal(clocks[0].key, 'reception:' + careBodies[0].request_id);
    assert.deepEqual(Object.keys(careBodies[0]).sort(), ['belongings', 'care_instructions', 'initial_condition', 'reason', 'request_id']);
    report('UI: validate phiếu, xác nhận đồng hồ trước Care và khóa kích hoạt gắn với request_id');

    active = false; status = 'CONFIRMED'; calls.length = 0;
    await open(); await fill();
    const selected = new Date(+start + 5 * 60000).toISOString();
    await page.getByLabel('Ngày/giờ mô phỏng (GMT+7)').fill(selected.slice(0, 10) + 'T09:05');
    await page.getByRole('button', { name: 'Áp dụng giờ mô phỏng', exact: true }).click();
    await page.getByText('Đã áp dụng giờ nghiệp vụ tại Booking. Đồng hồ tiếp tục chạy.').waitFor();
    assert.equal(clocks.at(-1).body.command, 'SET_TIME'); assert.equal(clocks.at(-1).body.time, selected);
    // Applying the panel must not unmount or erase a filled reception form.
    assert.equal(await page.getByLabel('Tình trạng lúc tiếp nhận').inputValue(), 'Healthy');
    await page.reload(); await fill();
    const clockCount = clocks.length;
    loseCare = true;
    await page.getByRole('button', { name: 'Xác nhận tiếp nhận (giờ demo)', exact: true }).click();
    await page.getByRole('button', { name: 'Gửi lại phiếu đang chờ', exact: true }).waitFor();
    const contextCount = calls.filter(value => value === 'context').length;
    enabled = false; // A later clock/config failure must not block recovery of Care's saved result.
    await page.getByRole('button', { name: 'Gửi lại phiếu đang chờ', exact: true }).click();
    await page.waitForURL('**/care/requests/**');
    assert.equal(clocks.length, clockCount); assert.equal(business, selected);
    assert.equal(calls.filter(value => value === 'context').length, contextCount);
    assert.deepEqual(careBodies.at(-1), careBodies.at(-2));
    assert.equal(receipt.status, 'SUCCEEDED');
    report('UI: giữ mốc thủ công sau tải lại; mất phản hồi Care dùng lại phiếu, không gọi lại đồng hồ');

    active = false; status = 'CONFIRMED';
    await open();
    await page.getByText('Demo đang tắt · chưa kích hoạt', { exact: true }).waitFor();
    await fill(); await page.getByRole('button', { name: 'Xác nhận tiếp nhận', exact: true }).click();
    await page.waitForURL('**/care/requests/**');
    await page.getByText(/Ngoài cửa sổ tiếp nhận của lịch đặt/).waitFor();
    await page.getByText(/gửi phiếu mới với mã yêu cầu mới/).waitFor();
    assert.equal(clocks.length, clockCount); assert.deepEqual(errors, []);
    report('UI: demo tắt giữ luồng cũ, lỗi ngoài giờ được giải thích và REJECTED yêu cầu phiếu mới');
  } finally { await browser.close(); }
}

if (process.env.PAWSTAY_TEST_DEMO_UI === 'true') {
  await demoClockBrowserFlow();
  process.exit(0);
}

const { petId, bookingId, paymentId } = await browserFlow();
await check('POST', '/auth/register', 409, { body: customer });
await check('POST', '/auth/login', 401, { body: { ...customer, password: 'incorrect' } });
await check('GET', '/pets', 401);
await check('GET', '/pets', 401, { token: 'invalid' });
const login = async body => (await check('POST', '/auth/login', 200, { body })).data.accessToken;
const token = await login(customer);
await check('POST', '/auth/register', 201, { body: second });
const otherToken = await login(second);
await check('GET', '/staff/bookings', 403, { token });
await check('GET', '/pets/' + petId, 404, { token: otherToken });
await check('GET', '/pets/000000000000000000000001', 404, { token });
assert.equal((await check('GET', '/pets/' + petId, 200, { token })).data.pet.weight_kg, 4.5);
report('Auth từ chối trùng tên, sai mật khẩu, thiếu/sai JWT, sai quyền; Pet đã lưu và kiểm tra chủ sở hữu');

const input = { pet_id: petId, service_id: 'bath', start_at: day(4) + 'T09:00:00+07:00' };
const quote = (await check('POST', '/bookings/quotes', 200, { body: input, token })).data.quote;
const body = { ...input, expected_price_version: quote.price_version_id, expected_pet_version: quote.pet_version };
const concurrent = await Promise.all([1, 2].map(() => call('POST', '/bookings', { body, token, key: suffix + '-booking' })));
assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 201]);
const duplicate = concurrent[0].value.data.booking;
assert.equal(duplicate.id, concurrent[1].value.data.booking.id);
await check('POST', '/bookings', 409, { body, token, key: suffix + '-booking-other' });
await check('POST', '/bookings/quotes', 400, { body: { ...input, start_at: 'invalid' }, token });
await check('POST', '/bookings/quotes', 404, { body: { ...input, pet_id: '000000000000000000000001' }, token });
const cancel = { body: { reason: 'Hủy lịch kiểm thử' }, token, key: suffix + '-cancel' };
await check('POST', '/bookings/' + duplicate.id + '/cancel', 200, cancel);
await check('POST', '/bookings/' + duplicate.id + '/cancel', 200, cancel);
assert.equal((await check('GET', '/bookings/' + duplicate.id, 200, { token })).data.booking.status, 'CANCELLED');
const history = (await check('GET', '/bookings/' + duplicate.id + '/history', 200, { token })).data.history;
assert.equal(history.filter(item => item.action === 'CANCELLED').length, 1);
await check('POST', '/pets/' + petId + '/archive', 200, { body: {}, token });
assert.equal((await check('GET', '/pets/' + petId, 200, { token })).data.pet.status, 'ARCHIVED');
await check('PATCH', '/pets/' + petId, 409, { body: { name: 'Tên mới' }, token });
report('Booking xử lý đồng thời, trùng giờ, dữ liệu sai, hủy lặp và lịch sử; Pet lưu trữ và khóa chỉnh sửa');

if (process.env.PAWSTAY_TEST_STAFF_USERNAME && process.env.PAWSTAY_TEST_STAFF_PASSWORD) {
  const staffToken = await login({ username: process.env.PAWSTAY_TEST_STAFF_USERNAME, password: process.env.PAWSTAY_TEST_STAFF_PASSWORD });
  const staff = { token: staffToken };
  await check('GET', '/staff/bookings', 200, staff);
  await check('GET', '/staff/bookings/' + bookingId, 200, staff);
  const contactPath = '/auth/staff/bookings/' + bookingId + '/contact';
  assert.deepEqual((await check('GET', contactPath, 200, staff)).data.contact, {
    full_name: customer.full_name, phone: customer.phone,
  });
  await check('GET', contactPath, 403, { token });
  const transactionPath = '/payments/staff/transactions';
  const refundPath = '/payments/staff/refund-requests';
  await check('GET', transactionPath, 200, staff);
  await check('GET', transactionPath + '?exceptions=true', 200, staff);
  await check('GET', refundPath, 200, staff);
  await check('GET', transactionPath, 403, { token });
  await check('GET', refundPath, 403, { token });
  const resource = (await check('GET', '/staff/resources', 200, staff)).data.resources[0];
  const path = '/staff/resources/' + resource.id;
  const item = (await check('POST', path + '/maintenance', 201, { ...staff, body: {
    start_at: day(10) + 'T08:00:00+07:00', end_at: day(10) + 'T09:00:00+07:00', reason: 'Bảo trì kiểm thử'
  } })).data.maintenance;
  await check('POST', path + '/maintenance/' + item.id + '/cancel', 200, { ...staff, body: { reason: 'Hủy bảo trì thử' } });
  const rows = (await check('GET', path + '/maintenance', 200, staff)).data.maintenance;
  assert.equal(rows.find(row => row.id === item.id).status, 'CANCELLED');
  await check('GET', path + '/history', 200, staff);
  const ready = await check('POST', path + '/cleaning-complete', 200, { ...staff, body: { reason: 'Xác nhận tài nguyên đã sẵn sàng' } });
  assert.equal(ready.data.resource.state, 'READY');
  report('STAFF xem lịch và tài nguyên, tạo/hủy bảo trì, đọc lịch sử và xác nhận tài nguyên sẵn sàng');
}

if (process.env.PAWSTAY_TEST_VNPAY_SECRET) {
  assert(paymentId);
  const payment = await check('GET', '/payments/' + paymentId, 200, { token });
  const paymentPath = '/payments/' + paymentId;
  const options = { body: { booking_id: bookingId, policy_accepted: true }, token, key: suffix + '-payment' };
  await check('POST', '/payments', 400, { ...options, body: { booking_id: bookingId } });
  await check('POST', '/payments', 400, { ...options, body: { booking_id: bookingId, policy_accepted: false } });
  const parallel = await Promise.all([1, 2].map(() => call('POST', '/payments', options)));
  assert.deepEqual(parallel.map(result => result.status).sort(), [200, 201]);
  assert.equal(parallel[0].value.payment_id, parallel[1].value.payment_id);
  await check('GET', paymentPath, 404, { token: otherToken });
  await check('POST', '/payments', 404, { ...options, body: { booking_id: '000000000000000000000001', policy_accepted: true }, key: suffix + '-unknown' });
  await check('POST', '/payments', 409, { ...options, body: { booking_id: duplicate.id, policy_accepted: true }, key: suffix + '-cancelled' });
  const returned = await call('GET', '/payments/vnpay/return?vnp_ResponseCode=00');
  assert([200, 303].includes(returned.status));
  assert.equal((await check('GET', paymentPath, 200, { token })).status, 'PENDING');
  const callback = async (fields, code, attempt = payment) => {
    const params = new URLSearchParams({
      vnp_Amount: String(attempt.amount * 100), vnp_OrderInfo: 'PawStay local + integration',
      vnp_TmnCode: process.env.PAWSTAY_TEST_VNPAY_TMN || 'TEST', vnp_TxnRef: attempt.payment_id.replaceAll('-', ''),
      vnp_TransactionNo: String(Date.now()), vnp_ResponseCode: '00', vnp_TransactionStatus: '00', ...fields,
    });
    params.sort();
    const hash = createHmac('sha512', process.env.PAWSTAY_TEST_VNPAY_SECRET).update(params.toString()).digest('hex');
    params.set('vnp_SecureHash', fields.invalidSignature ? 'invalid' : hash);
    params.delete('invalidSignature');
    assert.equal((await check('GET', '/payments/vnpay/ipn?' + params, 200)).RspCode, code);
  };
  await callback({ invalidSignature: true }, '97');
  await callback({ vnp_Amount: '1' }, '04');
  const fault = Boolean(process.env.PAWSTAY_TEST_PROJECT);
  if (fault) compose('stop', 'booking-service');
  try {
    await callback({}, '00');
    await callback({}, '02');
    const current = await check('GET', paymentPath, 200, { token });
    assert.equal(current.status, 'SUCCEEDED');
    if (fault) assert.equal(current.booking_sync_status, 'PENDING');
  } finally {
    if (fault) compose('up', '-d', '--no-build', '--wait', '--wait-timeout', '90', 'booking-service');
  }
  let sync;
  const deadline = Date.now() + 90000;
  do {
    sync = (await check('GET', paymentPath, 200, { token })).booking_sync_status;
    if (sync !== 'DELIVERED') await wait(1500);
  } while (sync !== 'DELIVERED' && Date.now() < deadline);
  assert.equal(sync, 'DELIVERED');
  if (fault) {
    compose('restart', 'payment-service');
    const end = Date.now() + 75000;
    let restored;
    do {
      restored = await call('GET', paymentPath, { token });
      if (restored.status !== 200) await wait(1500);
    } while (restored.status !== 200 && Date.now() < end);
    assert.equal(restored.value.booking_sync_status, 'DELIVERED');
  }
  const booking = (await check('GET', '/bookings/' + bookingId, 200, { token })).data.booking;
  assert.equal(booking.status, 'CONFIRMED');
  assert.equal(booking.accepted_payment_id, paymentId);
  report('Payment thực với IPN ký cục bộ: Return không ghi trạng thái, từ chối sai chữ ký/số tiền, xử lý replay và Outbox xác nhận booking');

  const newPet = (await check('POST', '/pets', 201, { body: { name: 'Kiểm thử VNPay', species: 'CAT', coat_type: 'SHORT', weight_kg: 4 }, token })).data.pet;
  async function newAttempt(index) {
    const request = { pet_id: newPet.id, service_id: 'stay-cat-s', check_in_date: day(index), check_out_date: day(index + 1), check_in_time: '15:00', check_out_time: '10:00' };
    const quote = (await check('POST', '/bookings/quotes', 200, { body: request, token })).data.quote;
    const next = (await check('POST', '/bookings', 201, { body: { ...request, expected_price_version: quote.price_version_id, expected_pet_version: quote.pet_version },
      token, key: suffix + '-boarding-' + index })).data.booking;
    return check('POST', '/payments', 201, { body: { booking_id: next.id, policy_accepted: true }, token, key: suffix + '-boarding-payment-' + index });
  }
  const late = await newAttempt(6);
  await check('POST', '/bookings/' + late.booking_id + '/cancel', 200,
    { body: { reason: 'Hủy trước khi IPN đến' }, token, key: suffix + '-late-cancel' });
  const failed = await newAttempt(8);
  await callback({ vnp_ResponseCode: '24', vnp_TransactionStatus: '02' }, '00', failed);
  await callback({ vnp_ResponseCode: '24', vnp_TransactionStatus: '02' }, '02', payment);
  await callback({}, '00', late);
  const failedValue = await check('GET', '/payments/' + failed.payment_id, 200, { token });
  assert.equal(failedValue.status, 'FAILED');
  assert.equal((await check('GET', '/bookings/' + failed.booking_id, 200, { token })).data.booking.status, 'PENDING_PAYMENT');
  const lateDeadline = Date.now() + 45000;
  let lateValue;
  do {
    lateValue = await check('GET', '/payments/' + late.payment_id, 200, { token });
    if (lateValue.booking_sync_status !== 'REJECTED') await wait(1500);
  } while (lateValue.booking_sync_status !== 'REJECTED' && Date.now() < lateDeadline);
  assert.equal(lateValue.status, 'SUCCEEDED');
  assert.equal(lateValue.booking_sync_status, 'REJECTED');
  assert.equal(lateValue.booking_sync_outcome, 'BOOKING_CANCELLED');
  if (process.env.PAWSTAY_TEST_VERIFY_REFUND_OUTBOX === 'true') {
    const staffToken = await login({ username: process.env.PAWSTAY_TEST_STAFF_USERNAME, password: process.env.PAWSTAY_TEST_STAFF_PASSWORD });
    const refundDeadline = Date.now() + 15000;
    let refunds;
    do {
      refunds = (await check('GET', '/payments/staff/refund-requests', 200, { token: staffToken })).refunds
        .filter(item => item.payment_id === late.payment_id);
      if (!refunds.length) await wait(1000);
    } while (!refunds.length && Date.now() < refundDeadline);
    assert.equal(refunds.length, 1);
    assert.equal(refunds[0].status, 'REQUESTED');
    assert.equal(refunds[0].amount, late.amount);
    await check('POST', '/payments/staff/refund-requests/' + refunds[0].event_id + '/confirm', 403, { token });
    report('Thanh toán đến muộn tạo đúng một yêu cầu hoàn toàn phần và chỉ STAFF có thể xác nhận');
  }
  assert.equal((await check('GET', '/bookings/' + late.booking_id, 200, { token })).data.booking.status, 'CANCELLED');
  report('IPN test báo thất bại giữ booking chờ; IPN lỗi đến sau thành công bị bỏ qua; IPN muộn không mở lại booking đã hủy');
} else {
  console.log('CHƯA CHẠY · Nhánh IPN ký cục bộ cần thông tin khóa test của stack riêng.');
}
