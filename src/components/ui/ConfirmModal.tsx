export function ConfirmModal({
  title,
  message,
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="actions">
          <button className="danger" onClick={onConfirm}>تأكيد الحذف</button>
          <button className="secondary" onClick={onCancel}>إلغاء</button>
        </div>
      </div>
    </div>
  )
}
