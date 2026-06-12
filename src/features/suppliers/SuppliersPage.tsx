import { CrudPage } from '../common/CrudPage'

export function SuppliersPage() {
  return (
    <CrudPage
      title="الموردون"
      table="suppliers"
      addLabel="إضافة مورد"
      fields={[
        { name: 'name', label: 'الاسم', required: true },
        { name: 'phone', label: 'الهاتف' },
        { name: 'email', label: 'البريد', type: 'email' },
        { name: 'service_category', label: 'نوع الخدمة' },
        { name: 'address', label: 'العنوان' },
        { name: 'notes', label: 'ملاحظات', type: 'textarea' },
      ]}
      columns={[
        { key: 'name', header: 'الاسم' },
        { key: 'phone', header: 'الهاتف' },
        { key: 'notes', header: 'ملاحظات' },
        { key: 'created_at', header: 'تاريخ الإنشاء' },
      ]}
    />
  )
}
