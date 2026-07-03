import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import ApplicationsList from './pages/Applications/ApplicationsList';
import ApplicationDetail from './pages/Applications/ApplicationDetail';
import Deficit from './pages/Deficit';
import Schedule from './pages/Schedule';
import UsersList from './pages/Users/UsersList';
import AuditLog from './pages/Audit/AuditProduction';
import AuditMobile from './pages/AuditMobile';
import ChangeLog from './pages/ChangeLog/ChangeLog';
import WarehousePage from './pages/WarehousePage';
import OrdersList from './pages/Orders/OrdersList';
import CompletedOrdersList from './pages/Orders/CompletedOrdersList';
import Feedback from './pages/Feedback';
import MorePage from './pages/MorePage';
import useIsMobile from './hooks/useIsMobile';

function MobileIndex() {
  const isMobile = useIsMobile();
  return isMobile ? <OrdersList initialTab="orders" /> : <ApplicationsList />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<MobileIndex />} />
            <Route path="applications/:id" element={<ApplicationDetail />} />
            <Route path="deficit" element={<Deficit />} />
            <Route path="warehouse" element={
              <ProtectedRoute roles={['admin', 'director', 'accountant', 'operator', 'customer']}>
                <WarehousePage />
              </ProtectedRoute>
            } />
            <Route path="schedule" element={
              <ProtectedRoute roles={['admin', 'director', 'accountant', 'operator']}>
                <Schedule />
              </ProtectedRoute>
            } />
            <Route path="users" element={
              <ProtectedRoute roles={['admin']}>
                <UsersList />
              </ProtectedRoute>
            } />
            <Route path="changelog" element={
              <ProtectedRoute roles={['admin']}>
                <ChangeLog />
              </ProtectedRoute>
            } />
            <Route path="audit" element={
              <ProtectedRoute roles={['admin', 'director', 'accountant']}>
                <AuditLog />
              </ProtectedRoute>
            } />
            <Route path="audit-mobile" element={
              <ProtectedRoute roles={['operator']}>
                <AuditMobile />
              </ProtectedRoute>
            } />
            <Route path="orders" element={
              <ProtectedRoute roles={['admin', 'director', 'accountant', 'operator', 'customer']}>
                <OrdersList />
              </ProtectedRoute>
            } />
            <Route path="completed" element={
              <ProtectedRoute roles={['admin', 'director', 'accountant', 'operator', 'customer']}>
                <CompletedOrdersList />
              </ProtectedRoute>
            } />
            <Route path="feedback" element={
              <ProtectedRoute roles={['admin', 'director', 'accountant', 'operator', 'customer']}>
                <Feedback />
              </ProtectedRoute>
            } />
            <Route path="more" element={
              <ProtectedRoute>
                <MorePage />
              </ProtectedRoute>
            } />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}