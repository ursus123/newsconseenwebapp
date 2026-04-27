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
import InviteUser from './pages/InviteUser';
import MedAdmin from './pages/MedAdmin';
import People from './pages/People';
import Permissions from './pages/Permissions';
import Products from './pages/Products';
import Relationships from './pages/Relationships';
import Reports from './pages/Reports.jsx';
import Services from './pages/Services';
import Tasks from './pages/Tasks';
import Transactions from './pages/Transactions';
import UserManagement from './pages/UserManagement';
import StaffSchedule from './pages/StaffSchedule';
import BarcodeScanner from './pages/BarcodeScanner';
import TaxonomyAdmin from './pages/TaxonomyAdmin';
import Documents from './pages/Documents';
import Schedules from './pages/Schedules';
import Signals from './pages/Signals';
import Channels from './pages/Channels';
import Territories from './pages/Territories';
import Animals from './pages/Animals';
import Plots from './pages/Plots';
import Observations from './pages/Observations';

export const PAGES = {
    "AddClient": AddClient,
    "Addresses": Addresses,
    "Applications": Applications,
    "ClockInOut": ClockInOut,
    "Dashboard": Dashboard,
    "DataModels": DataModels,
    "Enterprises": Enterprises,
    "InviteUser": InviteUser,
    "MedAdmin": MedAdmin,
    "People": People,
    "Permissions": Permissions,
    "Products": Products,
    "Relationships": Relationships,
    "Reports": Reports,
    "Services": Services,
    "Tasks": Tasks,
    "Transactions": Transactions,
    "UserManagement": UserManagement,
    "StaffSchedule": StaffSchedule,
    "BarcodeScanner": BarcodeScanner,
    "TaxonomyAdmin": TaxonomyAdmin,
    "Documents": Documents,
    "Schedules": Schedules,
    "Signals": Signals,
    "Channels": Channels,
    "Territories": Territories,
    "Animals": Animals,
    "Plots": Plots,
    "Observations": Observations,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
};