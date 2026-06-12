import { CrudPage } from '../common/CrudPage'

export function ServicesPage() {
  return (
    <CrudPage
      title="الخدمات"
      table="services"
      allowEmployeeCreate
      addLabel="إضافة خدمة"
      fields={[
        { name: 'name', label: 'اسم الخدمة', required: true },
        {
          name: 'type',
          label: 'النوع',
          required: true,
          type: 'select',
          options: [
            { value: 'ticket', label: 'تذكرة' },
            { value: 'visa', label: 'تأشيرة' },
            { value: 'hotel', label: 'فندق' },
            { value: 'transport', label: 'نقل' },
            { value: 'other', label: 'أخرى' },
          ],
        },
        { name: 'description', label: 'الوصف', type: 'textarea' },
        { name: 'is_active', label: 'نشطة', type: 'checkbox' },
      ]}
      columns={[
        { key: 'name', header: 'الخدمة' },
        { key: 'type', header: 'النوع' },
        { key: 'is_active', header: 'نشطة' },
      ]}
    />
  )
}
