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
import Connectors from './pages/Connectors';
import MLModels from './pages/MLModels';
import ObjectExplorer from './pages/ObjectExplorer';
import KineticLayer from './pages/KineticLayer';
import ObjectViews from './pages/ObjectViews';
import Landing from './pages/Landing';
import QueryPublic from './pages/QueryPublic';
import ExplorePublic from './pages/ExplorePublic';
import Agents from './pages/Agents';
import Workflows from './pages/Workflows';
import TenantAdmin from './pages/TenantAdmin';
import Mobile from './pages/Mobile';
import Documents from './pages/Documents';
import Schedules from './pages/Schedules';
import Signals from './pages/Signals';
import Channels from './pages/Channels';
import Territories from './pages/Territories';
import Animals from './pages/Animals';
import Plots from './pages/Plots';
import Observations from './pages/Observations';
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
      <Route path="/Connectors" element={<LayoutWrapper currentPageName="Connectors"><Connectors /></LayoutWrapper>} />
      <Route path="/MLModels" element={<LayoutWrapper currentPageName="ML Models"><MLModels /></LayoutWrapper>} />
      <Route path="/ObjectExplorer" element={<LayoutWrapper currentPageName="Object Explorer"><ObjectExplorer /></LayoutWrapper>} />
      <Route path="/KineticLayer" element={<LayoutWrapper currentPageName="Kinetic Layer"><KineticLayer /></LayoutWrapper>} />
      <Route path="/agents" element={<LayoutWrapper currentPageName="Agents"><Agents /></LayoutWrapper>} />
      <Route path="/Workflows" element={<LayoutWrapper currentPageName="Workflows"><Workflows /></LayoutWrapper>} />
      <Route path="/ObjectViews" element={<LayoutWrapper currentPageName="Object Views"><ObjectViews /></LayoutWrapper>} />
      <Route path="/TenantAdmin" element={<LayoutWrapper currentPageName="Tenant Admin"><TenantAdmin /></LayoutWrapper>} />
      <Route path="/Documents" element={<LayoutWrapper currentPageName="Documents"><Documents /></LayoutWrapper>} />
      <Route path="/Schedules" element={<LayoutWrapper currentPageName="Schedules"><Schedules /></LayoutWrapper>} />
      <Route path="/Signals" element={<LayoutWrapper currentPageName="Signals"><Signals /></LayoutWrapper>} />
      <Route path="/Channels" element={<LayoutWrapper currentPageName="Channels"><Channels /></LayoutWrapper>} />
      <Route path="/Territories" element={<LayoutWrapper currentPageName="Territories"><Territories /></LayoutWrapper>} />
      <Route path="/Animals" element={<LayoutWrapper currentPageName="Animals"><Animals /></LayoutWrapper>} />
      <Route path="/Plots" element={<LayoutWrapper currentPageName="Plots"><Plots /></LayoutWrapper>} />
      <Route path="/Observations" element={<LayoutWrapper currentPageName="Observations"><Observations /></LayoutWrapper>} />
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