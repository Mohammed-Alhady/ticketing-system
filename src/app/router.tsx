import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AdminRoute } from '../components/layout/AdminRoute'
import { Layout } from '../components/layout/Layout'
import { ProtectedRoute } from '../components/layout/ProtectedRoute'
import { AccountPage } from '../features/accounts/AccountPages'
import { LoginPage } from '../features/auth/LoginPage'
import { CustomersPage } from '../features/customers/CustomersPage'
import { DashboardPage } from '../features/reports/DashboardPage'
import { ReportsPage } from '../features/reports/ReportsPage'
import { ServicesPage } from '../features/services/ServicesPage'
import { SuppliersPage } from '../features/suppliers/SuppliersPage'
import { UpcomingFlightsPage } from '../features/tickets/UpcomingFlightsPage'
import { TransactionsPage } from '../features/transactions/TransactionsPage'
import { UsersPage } from '../features/users/UsersPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/customers', element: <CustomersPage /> },
          { path: '/suppliers', element: <SuppliersPage /> },
          { path: '/services', element: <ServicesPage /> },
          { path: '/transactions', element: <TransactionsPage /> },
          { path: '/upcoming-flights', element: <UpcomingFlightsPage /> },
          { path: '/customer-accounts', element: <AccountPage type="customer" /> },
          { path: '/customer-accounts/:customerId', element: <AccountPage type="customer" /> },
          { path: '/supplier-accounts', element: <AccountPage type="supplier" /> },
          { path: '/supplier-accounts/:supplierId', element: <AccountPage type="supplier" /> },
          { path: '/customer-payments', element: <Navigate to="/customer-accounts" replace /> },
          { path: '/supplier-payments', element: <Navigate to="/supplier-accounts" replace /> },
          { path: '/reports', element: <ReportsPage /> },
          {
            element: <AdminRoute />,
            children: [{ path: '/users', element: <UsersPage /> }],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
])
