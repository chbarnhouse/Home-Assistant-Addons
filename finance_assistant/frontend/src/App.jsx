import { useState, useEffect } from "react";
import {
  Routes,
  Route,
  Link as RouterLink,
  BrowserRouter as Router,
  useLocation,
} from "react-router-dom";
import { fetchAllData } from "./utils/api"; // CORRECTED IMPORT PATH
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import MenuIcon from "@mui/icons-material/Menu";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import DashboardIcon from "@mui/icons-material/Dashboard";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import AnalyticsIcon from "@mui/icons-material/Analytics";
import SettingsIcon from "@mui/icons-material/Settings";
import CreditScoreIcon from "@mui/icons-material/CreditScore";
import CategoryIcon from "@mui/icons-material/Category";
import PeopleIcon from "@mui/icons-material/People";
import PaymentIcon from "@mui/icons-material/Payment";
import DashboardPage from "./pages/DashboardPage";
import AccountsPage from "./pages/AccountsPage";
import AssetsPage from "./pages/AssetsPage";
import LiabilitiesPage from "./pages/LiabilitiesPage";
import CreditCardsPage from "./pages/CreditCardsPage";
import TransactionsPage from "./pages/TransactionsPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import SettingsPage from "./pages/SettingsPage";
import PaymentMethodsPage from "./pages/PaymentMethodsPage";
import CategoriesPage from "./pages/CategoriesPage";
import PayeesPage from "./pages/PayeesPage";
import { ThemeProviderWrapper } from "./context/ThemeContext";
import { SnackbarProvider } from "./context/SnackbarContext";
import SnackbarManager from "./components/SnackbarManager";

// Add a component for the catch-all route
function NotFound() {
  const location = useLocation();
  useEffect(() => {
    console.warn(
      `ROUTER WARNING: No route matched location "${location.pathname}"`
    );
  }, [location]);

  // Optionally render some fallback UI, or null
  return (
    <Typography color="error" sx={{ mt: 2 }}>
      Error: Page not found (Path: {location.pathname})
    </Typography>
  );
}

const drawerWidth = 240;

const navItems = [
  { text: "Dashboard", icon: <DashboardIcon />, path: "/" },
  { text: "Accounts", icon: <AccountBalanceWalletIcon />, path: "/accounts" },
  { text: "Assets", icon: <ShowChartIcon />, path: "/assets" },
  { text: "Liabilities", icon: <AccountBalanceIcon />, path: "/liabilities" },
  { text: "Credit Cards", icon: <CreditCardIcon />, path: "/credit-cards" },
  { text: "Categories", icon: <CategoryIcon />, path: "/categories" },
  { text: "Payees", icon: <PeopleIcon />, path: "/payees" },
  { text: "Transactions", icon: <ReceiptLongIcon />, path: "/transactions" },
  { text: "Analytics", icon: <AnalyticsIcon />, path: "/analytics" },
];

const settingsNav = [
  { text: "Settings", icon: <SettingsIcon />, path: "/settings" },
  { text: "Payment Methods", icon: <PaymentIcon />, path: "/payment-methods" },
];

// Helper component to determine the active route title
function CurrentRouteTitle() {
  const location = useLocation();
  let title = "Dashboard"; // Default title

  // Find the nav item corresponding to the current path
  const currentNavItem = [...navItems, ...settingsNav].find(
    (item) => item.path === location.pathname
  );

  if (currentNavItem) {
    title = currentNavItem.text;
  } else {
    // Handle cases not explicitly in navItems if necessary, or keep default
    switch (location.pathname) {
      // Add any non-nav paths here if needed
      case "/payees":
        title = "Payees";
        break;
      case "/liabilities":
        title = "Liabilities";
        break;
      default:
        title = "Dashboard"; // Fallback
        break;
    }
  }

  return (
    <Typography variant="h6" noWrap component="div">
      {title}
    </Typography>
  );
}

function App() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation(); // Get location here to pass to ListItemButton

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const drawer = (
    <div>
      <Toolbar />
      <Divider />
      <List>
        {navItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              component={RouterLink}
              to={item.path}
              selected={location.pathname === item.path} // Highlight based on current path
              onClick={handleDrawerToggle}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Divider />
      <List>
        {settingsNav.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              component={RouterLink}
              to={item.path}
              onClick={handleDrawerToggle}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </div>
  );

  return (
    <Box sx={{ display: "flex" }}>
      <AppBar
        position="fixed"
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>
          <CurrentRouteTitle />
        </Toolbar>
      </AppBar>
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{
          keepMounted: true,
        }}
        sx={{
          "& .MuiDrawer-paper": { boxSizing: "border-box", width: drawerWidth },
        }}
      >
        {drawer}
      </Drawer>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          mt: "64px",
          height: "calc(100vh - 64px)",
          overflow: "auto",
        }}
      >
        <Container maxWidth="lg" sx={{}}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/assets" element={<AssetsPage />} />
            <Route path="/liabilities" element={<LiabilitiesPage />} />
            <Route path="/credit-cards" element={<CreditCardsPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/payees" element={<PayeesPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/payment-methods" element={<PaymentMethodsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Container>
      </Box>
    </Box>
  );
}

function AppWrapper() {
  return (
    <ThemeProviderWrapper>
      <SnackbarProvider>
        <App />
        <SnackbarManager />
      </SnackbarProvider>
    </ThemeProviderWrapper>
  );
}

export default AppWrapper;
