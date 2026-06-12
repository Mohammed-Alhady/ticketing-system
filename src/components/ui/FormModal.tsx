import type { ReactNode } from 'react'

export function FormModal({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal wide-modal">
        <div className="page-header">
          <h3>{title}</h3>
          <button type="button" className="secondary" onClick={onClose}>إغلاق</button>
        </div>
        {children}
      </div>
    </div>
  )
}
