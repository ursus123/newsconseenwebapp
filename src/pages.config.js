/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AddClient from './pages/AddClient';
import Addresses from './pages/Addresses';
import Applications from './pages/Applications';
import ClockInOut from './pages/ClockInOut';
import Dashboard from './pages/Dashboard';
import DataModels from './pages/DataModels';
import Enterprises from './pages/Enterprises';
import EntityGraph from './pages/EntityGraph';
import InviteUser from './pages/InviteUser';
import MedAdmin from './pages/MedAdmin';
import PdfToExcel from './pages/PdfToExcel';
import People from './pages/People';
import Permissions from './pages/Permissions';
import Products from './pages/Products';
import QueryBuilder from './pages/QueryBuilder';
import Relationships from './pages/Relationships';
import Reports from './pages/Reports.jsx';
import Services from './pages/Services';
import Tasks from './pages/Tasks';
import Transactions from './pages/Transactions';
import UserManagement from './pages/UserManagement';
import Pipelines from './pages/Pipelines';
import Billing from './pages/Billing';
import StaffSchedule from './pages/StaffSchedule';
import BarcodeScanner from './pages/BarcodeScanner';
import MLModels from './pages/MLModels';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AddClient": AddClient,
    "Addresses": Addresses,
    "Applications": Applications,
    "ClockInOut": ClockInOut,
    "Dashboard": Dashboard,
    "DataModels": DataModels,
    "Enterprises": Enterprises,
    "EntityGraph": EntityGraph,
    "InviteUser": InviteUser,
    "MedAdmin": MedAdmin,
    "PdfToExcel": PdfToExcel,
    "People": People,
    "Permissions": Permissions,
    "Products": Products,
    "QueryBuilder": QueryBuilder,
    "Relationships": Relationships,
    "Reports": Reports,
    "Services": Services,
    "Tasks": Tasks,
    "Transactions": Transactions,
    "UserManagement": UserManagement,
    "Pipelines": Pipelines,
    "Billing": Billing,
    "StaffSchedule": StaffSchedule,
    "BarcodeScanner": BarcodeScanner,
    "MLModels": MLModels,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};