import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedLayout from "@/components/ProtectedLayout";
import LoginPage from "@/components/pages/LoginPage";
import DashboardPage from "@/components/pages/DashboardPage";
import ProjectsPage from "@/components/pages/ProjectsPage";
import TemplatesPage from "@/components/pages/TemplatesPage";
import ExportsPage from "@/components/pages/ExportsPage";
import BillingPage from "@/components/pages/BillingPage";
import SettingsPage from "@/components/pages/SettingsPage";
import ErrorBoundary from "@/components/ErrorBoundary";

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <ErrorBoundary>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={(
              <ProtectedLayout>
                <DashboardPage />
              </ProtectedLayout>
            )}
          />
          <Route
            path="/projects"
            element={(
              <ProtectedLayout>
                <ProjectsPage />
              </ProtectedLayout>
            )}
          />
          <Route
            path="/templates"
            element={(
              <ProtectedLayout>
                <TemplatesPage />
              </ProtectedLayout>
            )}
          />
          <Route
            path="/exports"
            element={(
              <ProtectedLayout>
                <ExportsPage />
              </ProtectedLayout>
            )}
          />
          <Route
            path="/billing"
            element={(
              <ProtectedLayout>
                <BillingPage />
              </ProtectedLayout>
            )}
          />
          <Route
            path="/settings"
            element={(
              <ProtectedLayout>
                <SettingsPage />
              </ProtectedLayout>
            )}
          />
          <Route path="*" element={<LoginPage />} />
        </Routes>
        <Toaster position="top-right" toastOptions={{ duration: 4500 }} />
      </ErrorBoundary>
    </AuthProvider>
  </BrowserRouter>
);

export default App;
