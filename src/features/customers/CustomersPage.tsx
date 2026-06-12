import { CrudPage } from '../common/CrudPage'

export function CustomersPage() {
  return (
    <CrudPage
      title="العملاء"
      table="customers"
      addLabel="إضافة عميل"
      fields={[
        { name: 'name', label: 'الاسم', required: true },
        { name: 'phone', label: 'الهاتف' },
        { name: 'passport_number', label: 'رقم الجواز' },
        { name: 'email', label: 'البريد', type: 'email' },
        { name: 'address', label: 'العنوان' },
        { name: 'notes', label: 'ملاحظات', type: 'textarea' },
      ]}
      columns={[
        { key: 'name', header: 'الاسم' },
        { key: 'phone', header: 'الهاتف' },
        { key: 'passport_number', header: 'رقم الجواز' },
        { key: 'notes', header: 'ملاحظات' },
        { key: 'created_at', header: 'تاريخ الإنشاء' },
      ]}
    />
  )
}
