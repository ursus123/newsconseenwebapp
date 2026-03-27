import React from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import ErrorBoundary from '@/components/shared/ErrorBoundary';
import PageNotFound from './lib/PageNotFound';
import EntityGraph from './pages/EntityGraph';
import PdfToExcel from './pages/PdfToExcel';
import Pipelines from './pages/Pipelines';
import QueryBuilder from './pages/QueryBuilder';
import Onboarding from './pages/Onboarding';
import Pricing from './pages/Pricing';
import Billing from './pages/Billing';
import Settings from './pages/Settings';
import DataRepair from './pages/DataRepair';
import StockCounter from './pages/StockCounter';
import MarketIntelligence from './pages/MarketIntelligence';
import MarketIntelligencePDF from './pages/MarketIntelligencePDF';
import AttendanceRegister from './pages/AttendanceRegister';
import ClientOnboarding from './pages/ClientOnboarding';
import Desktop from './pages/Desktop';
import DesktopSettings from './pages/DesktopSettings';
import FileManager from './pages/FileManager';
import Attendance from './pages/Attendance';
import MapExplorer from './pages/MapExplorer';
import Copilot from './pages/Copilot';
import AlertsPageWrapper from './pages/AlertsPageWrapper';
import NetworkPage from './pages/NetworkPage';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ? (
  <Layout currentPageName={currentPageName}>
    <ErrorBoundary pageName={currentPageName}>
      {children}
    </ErrorBoundary>
  </Layout>
) : (
  <ErrorBoundary pageName={currentPageName}>
    {children}
  </ErrorBoundary>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, user } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  // Onboarding redirect
  const needsOnboarding =
    (user?.role === "admin" || user?.role === "super_admin") &&
    !user?.onboarding_complete;

  if (needsOnboarding && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  // Render the main app
  return (
    <Routes>
      {/* Onboarding — no layout wrapper */}
      <Route path="/onboarding" element={<Onboarding />} />

      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="/EntityGraph" element={<LayoutWrapper currentPageName="EntityGraph"><EntityGraph /></LayoutWrapper>} />
      <Route path="/QueryBuilder" element={<LayoutWrapper currentPageName="Query Builder"><QueryBuilder /></LayoutWrapper>} />
      <Route path="/PdfToExcel" element={<LayoutWrapper currentPageName="PDF to Excel"><PdfToExcel /></LayoutWrapper>} />
      <Route path="/Pipelines" element={<LayoutWrapper currentPageName="Pipelines"><Pipelines /></LayoutWrapper>} />
      <Route path="/Billing" element={<LayoutWrapper currentPageName="Billing"><Billing /></LayoutWrapper>} />
      <Route path="/Settings" element={<LayoutWrapper currentPageName="Settings"><Settings /></LayoutWrapper>} />
      <Route path="/DataRepair" element={<LayoutWrapper currentPageName="Data Repair"><DataRepair /></LayoutWrapper>} />
      <Route path="/StockCounter" element={<LayoutWrapper currentPageName="StockCounter"><StockCounter /></LayoutWrapper>} />
      <Route path="/MarketIntelligence" element={<LayoutWrapper currentPageName="Market Intelligence"><MarketIntelligence /></LayoutWrapper>} />
      <Route path="/MarketIntelligencePDF" element={<LayoutWrapper currentPageName="Market Intelligence PDF"><MarketIntelligencePDF /></LayoutWrapper>} />
      <Route path="/AttendanceRegister" element={<LayoutWrapper currentPageName="Attendance Register"><AttendanceRegister /></LayoutWrapper>} />
      <Route path="/ClientOnboarding" element={<LayoutWrapper currentPageName="Enroll Student/Client"><ClientOnboarding /></LayoutWrapper>} />
      <Route path="/Attendance" element={<LayoutWrapper currentPageName="Attendance"><Attendance /></LayoutWrapper>} />
      <Route path="/MapExplorer" element={<LayoutWrapper currentPageName="Map Explorer"><MapExplorer /></LayoutWrapper>} />
      <Route path="/copilot" element={<LayoutWrapper currentPageName="Copilot"><Copilot /></LayoutWrapper>} />
      <Route path="/alerts" element={<LayoutWrapper currentPageName="Operational Alerts"><AlertsPageWrapper /></LayoutWrapper>} />
      <Route path="/network" element={<LayoutWrapper currentPageName="Network"><NetworkPage /></LayoutWrapper>} />
      {/* Desktop Shell — NO layout wrapper, full screen */}
      <Route path="/Desktop" element={<Desktop />} />
      <Route path="/DesktopSettings" element={<DesktopSettings />} />
      <Route path="/files" element={<LayoutWrapper currentPageName="File Manager"><FileManager /></LayoutWrapper>} />

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {
  return (
    <ErrorBoundary pageName="Application" isTopLevel>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <Routes>
              {/* Public routes — no auth required */}
              <Route path="/pricing" element={<Pricing />} />
              {/* All other routes go through auth */}
              <Route path="/*" element={<AuthenticatedApp />} />
            </Routes>
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App