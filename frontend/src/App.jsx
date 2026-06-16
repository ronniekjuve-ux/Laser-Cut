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
import ChangeLog from './pages/ChangeLog/ChangeLog';
import Warehouse from './pages/Warehouse/Warehouse';

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
            <Route index element={<ApplicationsList />} />
            <Route path="applications/:id" element={<ApplicationDetail />} />
            <Route path="deficit" element={<Deficit />} />
            <Route path="warehouse" element={
              <ProtectedRoute roles={['admin', 'director', 'operator']}>
                <Warehouse />
              </ProtectedRoute>
            } />
            <Route path="schedule" element={<Schedule />} />
            <Route path="users" element={
              <ProtectedRoute roles={['admin', 'director']}>
                <UsersList />
              </ProtectedRoute>
            } />
            <Route path="changelog" element={
              <ProtectedRoute roles={['admin', 'director']}>
                <ChangeLog />
              </ProtectedRoute>
            } />
            <Route path="audit" element={
              <ProtectedRoute roles={['admin', 'director']}>
                <AuditLog />
              </ProtectedRoute>
            } />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}