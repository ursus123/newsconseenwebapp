import React, { useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation, useNavigate } from 'react-router-dom';
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
import DataReadiness from './pages/DataReadiness';
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
import Idjwi from './pages/Idjwi';
import AlertsPageWrapper from './pages/AlertsPageWrapper';
import NetworkPage from './pages/NetworkPage';
import Connectors from './pages/Connectors';
import MLModels from './pages/MLModels';
import ObjectExplorer from './pages/ObjectExplorer';
import KineticLayer from './pages/KineticLayer';
import ObjectViews from './pages/ObjectViews';
import Landing from './pages/Landing';
import Login from './pages/Login';
import AcceptInvite from './pages/AcceptInvite';
import QueryPublic from './pages/QueryPublic';
import ExplorePublic from './pages/ExplorePublic';
import Agents from './pages/Agents';
import Workflows from './pages/Workflows';
import TenantAdmin from './pages/TenantAdmin';
import Mobile from './pages/Mobile';
import IngestionAgent from './pages/IngestionAgent';
import Layout from './Layout.jsx';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const { Pages, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => (
  <Layout currentPageName={currentPageName}>
    <ErrorBoundary pageName={currentPageName}>
      {children}
    </ErrorBoundary>
  </Layout>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authStatus, authError, retryAuth, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (authStatus === 'unauthenticated' || authError?.type === 'auth_required') {
      const returnUrl = `${location.pathname}${location.search || ''}`;
      if (returnUrl !== '/login') sessionStorage.setItem('auth_return_url', returnUrl);
      navigate('/login', { replace: true });
    }
  }, [authStatus, authError?.type, location.pathname, location.search, navigate]);

  // Session verification gets a compact branded state. Profile loading shows
  // the workspace shell immediately instead of a blank full-screen spinner.
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 bg-slate-50">
        <header className="h-16 border-b border-slate-200 bg-white px-6 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center font-bold">N</div>
          <div><p className="text-sm font-semibold text-slate-900">Newsconseen</p><p className="text-[11px] text-slate-400">Autonomous SME Operating System</p></div>
        </header>
        <div className="max-w-lg mx-auto mt-24 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
          <div className="mx-auto h-9 w-9 rounded-full border-4 border-slate-200 border-t-emerald-600 animate-spin" />
          <h1 className="mt-5 text-lg font-semibold text-slate-900">
            {authStatus === 'profile_loading' ? 'Loading your workspace' : 'Verifying your session'}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {authStatus === 'profile_loading'
              ? 'Your session is active. Newsconseen is loading your tenant, role, and permissions.'
              : 'Securely reconnecting to your Newsconseen session.'}
          </p>
        </div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      return null;
    } else if (authError.type === 'profile_error' || authError.type === 'auth_error') {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
            <h1 className="text-lg font-semibold text-slate-900">Workspace could not finish loading</h1>
            <p className="mt-2 text-sm text-slate-600">{authError.message}</p>
            <div className="mt-5 flex gap-2">
              <button onClick={retryAuth} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Retry workspace</button>
              <button onClick={() => navigate('/login', { replace: true })} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Return to sign in</button>
            </div>
          </div>
        </div>
      );
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
      {/* Onboarding is now a public route */}

      <Route path="/app" element={
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
      <Route path="/DataReadiness" element={<LayoutWrapper currentPageName="Data Readiness"><DataReadiness /></LayoutWrapper>} />
      <Route path="/StockCounter" element={<LayoutWrapper currentPageName="StockCounter"><StockCounter /></LayoutWrapper>} />
      <Route path="/MarketIntelligence" element={<LayoutWrapper currentPageName="Market Intelligence"><MarketIntelligence /></LayoutWrapper>} />
      <Route path="/MarketIntelligencePDF" element={<LayoutWrapper currentPageName="Market Intelligence PDF"><MarketIntelligencePDF /></LayoutWrapper>} />
      <Route path="/AttendanceRegister" element={<LayoutWrapper currentPageName="Attendance Register"><AttendanceRegister /></LayoutWrapper>} />
      <Route path="/ClientOnboarding" element={<LayoutWrapper currentPageName="Enroll Student/Client"><ClientOnboarding /></LayoutWrapper>} />
      <Route path="/Attendance" element={<LayoutWrapper currentPageName="Attendance"><Attendance /></LayoutWrapper>} />
      <Route path="/MapExplorer" element={<LayoutWrapper currentPageName="Map Explorer"><MapExplorer /></LayoutWrapper>} />
      <Route path="/copilot" element={<LayoutWrapper currentPageName="Idjwi"><Idjwi /></LayoutWrapper>} />
      <Route path="/alerts" element={<LayoutWrapper currentPageName="Operational Alerts"><AlertsPageWrapper /></LayoutWrapper>} />
      <Route path="/network" element={<LayoutWrapper currentPageName="Network"><NetworkPage /></LayoutWrapper>} />
      <Route path="/Connectors" element={<LayoutWrapper currentPageName="Connectors"><Connectors /></LayoutWrapper>} />
      <Route path="/MLModels" element={<LayoutWrapper currentPageName="ML Models"><MLModels /></LayoutWrapper>} />
      <Route path="/ObjectExplorer" element={<LayoutWrapper currentPageName="Object Explorer"><ObjectExplorer /></LayoutWrapper>} />
      <Route path="/KineticLayer" element={<LayoutWrapper currentPageName="Kinetic Layer"><KineticLayer /></LayoutWrapper>} />
      <Route path="/agents" element={<LayoutWrapper currentPageName="Agents"><Agents /></LayoutWrapper>} />
      <Route path="/Workflows" element={<LayoutWrapper currentPageName="Workflows"><Workflows /></LayoutWrapper>} />
      <Route path="/ObjectViews" element={<LayoutWrapper currentPageName="Object Views"><ObjectViews /></LayoutWrapper>} />
      <Route path="/TenantAdmin" element={<LayoutWrapper currentPageName="Tenant Admin"><TenantAdmin /></LayoutWrapper>} />
      <Route path="/IngestionAgent" element={<LayoutWrapper currentPageName="Ingestion Agent"><IngestionAgent /></LayoutWrapper>} />
      {/* Desktop Shell — NO layout wrapper, full screen */}
      <Route path="/Desktop" element={<Desktop />} />
      <Route path="/DesktopSettings" element={<DesktopSettings />} />
      {/* Mobile PWA Shell — NO layout wrapper, standalone field agent app */}
      <Route path="/Mobile" element={<Mobile />} />
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
              <Route path="/login" element={<Login />} />
              <Route path="/AcceptInvite" element={<AcceptInvite />} />
              <Route path="/" element={<Landing />} />
              <Route path="/query" element={<QueryPublic />} />
              <Route path="/explore" element={<ExplorePublic />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/landing" element={<Landing />} />
              <Route path="/onboarding" element={<Onboarding />} />
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
