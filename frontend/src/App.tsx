import { Toaster } from 'react-hot-toast';
import { useAuth } from './store/auth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  const { initialized, user, load } = useAuth();
  if (!initialized) {
    void load();
    return <main className="grid min-h-screen place-items-center bg-slate-50 text-slate-500">正在验证服务端会话...</main>;
  }
  return (
    <ErrorBoundary>
      {user ? <Dashboard /> : <Login />}
      <Toaster position="top-right" toastOptions={{ className: 'text-sm font-medium' }} />
    </ErrorBoundary>
  );
}
