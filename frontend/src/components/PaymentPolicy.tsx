export function PaymentPolicy({ accepted, onChange, disabled }: {
  accepted: boolean;
  onChange: (accepted: boolean) => void;
  disabled?: boolean;
}) {
  return <section className="payment-policy" aria-labelledby="payment-policy-title">
    <h3 id="payment-policy-title">Chính sách hủy và hoàn tiền</h3>
    <ul>
      <li>Hủy trước giờ hẹn ít nhất 24 giờ: hoàn 100%.</li>
      <li>Hủy trước giờ hẹn dưới 24 giờ: không hoàn tiền.</li>
      <li>Đến muộn quá 15 phút: hủy lịch và không hoàn tiền.</li>
      <li>Cơ sở không thể cung cấp dịch vụ: hoàn 100%.</li>
    </ul>
    <label>
      <input type="checkbox" checked={accepted} disabled={disabled} onChange={event => onChange(event.target.checked)}/>
      Tôi đã đọc và đồng ý với chính sách hủy và hoàn tiền.
    </label>
  </section>;
}
