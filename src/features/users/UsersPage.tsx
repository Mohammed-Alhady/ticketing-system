import { CrudPage } from '../common/CrudPage'

export function UsersPage() {
  return (
    <CrudPage
      title="المستخدمون والصلاحيات"
      table="profiles"
      fields={[
        { name: 'id', label: 'معرف مستخدم Supabase Auth', required: true },
        { name: 'full_name', label: 'الاسم الكامل', required: true },
        {
          name: 'role',
          label: 'الدور',
          required: true,
          type: 'select',
          options: [
            { value: 'admin', label: 'مدير' },
            { value: 'employee', label: 'موظف' },
          ],
        },
      ]}
      columns={[
        { key: 'full_name', header: 'الاسم' },
        { key: 'role', header: 'الدور' },
        { key: 'id', header: 'معرف المستخدم' },
      ]}
    />
  )
}
