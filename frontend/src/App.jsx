import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import OrganizationPage from './pages/OrganizationPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import BlackjackPage from './pages/BlackjackPage.jsx';
import ShootingPage from './pages/ShootingPage.jsx';
import AIAdvisorPage from './pages/AIAdvisorPage.jsx';
import ProjectPage from './pages/ProjectPage.jsx';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!user) return <Navigate to="/landing" replace />;
  return children;
}

function GuestRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/landing" element={<GuestRoute><LandingPage /></GuestRoute>} />
      <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
      <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="organizations/:orgId/*" element={<OrganizationPage />} />
        <Route path="organizations/:orgId/projects/:projectId/*" element={<ProjectPage />} />
        <Route path="advisor" element={<AIAdvisorPage />} />
        <Route path="blackjack" element={<BlackjackPage />} />
        <Route path="shooting" element={<ShootingPage />} />
        <Route path="admin/*" element={<AdminPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
    </Routes>
  );
}
