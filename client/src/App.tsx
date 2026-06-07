/*
 * App.tsx — Vitum Lab
 * Design: Contemporary Clinical
 * Routes, layout wrapper, age gate logic
 */

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useEffect, useState } from "react";
import AgeGate from "./components/AgeGate";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import CookieConsent from "./components/CookieConsent";
import CartDrawer from "./components/CartDrawer";
import BackToTop from "./components/BackToTop";
import { CartProvider } from "./contexts/CartContext";
import Home from "./pages/Home";
import ResearchDisclaimer from "./pages/ResearchDisclaimer";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import ShippingPolicy from "./pages/ShippingPolicy";
import ReturnPolicy from "./pages/ReturnPolicy";
import Shop from "./pages/Shop";
import About from "./pages/About";
import Contact from "./pages/Contact";
import FAQ from "./pages/FAQ";
import ProductDetail from "./pages/ProductDetail";
import OrderSuccess from "./pages/OrderSuccess";
import OrderCancel from "./pages/OrderCancel";
import DoseCalculator from "./pages/DoseCalculator";
import COALibrary from "./pages/COALibrary";
import Research from "./pages/Research";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import Login from "./pages/Login";
import Account from "./pages/Account";
import AffiliateLogin from "./pages/AffiliateLogin";
import AffiliateDashboard from "./pages/AffiliateDashboard";
import { AuthProvider } from "./contexts/AuthContext";
import { Analytics } from "@vercel/analytics/react";

// ─── Scroll to top on every route change ─────────────────────────────────────
function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [location]);
  return null;
}

// ─── Age gate cookie check ────────────────────────────────────────────────────
function isAgeVerified(): boolean {
  return document.cookie.split(";").some((c) => c.trim().startsWith("vitum_age_verified=true"));
}

// ─── Placeholder page for unbuilt routes ─────────────────────────────────────
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center">
        <p className="section-label mb-3">Coming Soon</p>
        <h1 className="text-2xl font-bold text-[oklch(0.18_0.04_255)] mb-2">{title}</h1>
        <p className="text-sm text-[oklch(0.55_0.02_255)]">
          This page is under construction. Check back soon.
        </p>
      </div>
    </div>
  );
}

function Router() {
  return (
    <>
      <ScrollToTop />
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/shop" component={Shop} />
      <Route path="/shop/:slug" component={ProductDetail} />
      <Route path="/coa-library" component={COALibrary} />
      <Route path="/about" component={About} />
      <Route path="/contact" component={Contact} />
      <Route path="/faq" component={FAQ} />
      <Route path="/shipping-policy" component={ShippingPolicy} />
      <Route path="/return-policy" component={ReturnPolicy} />
      <Route path="/terms-of-service" component={TermsOfService} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/research-disclaimer" component={ResearchDisclaimer} />
      <Route path="/dose-calculator" component={DoseCalculator} />
      <Route path="/research" component={Research} />
      <Route path="/order-success" component={OrderSuccess} />
      <Route path="/order-cancel" component={OrderCancel} />
      <Route path="/login" component={Login} />
      <Route path="/account" component={Account} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
    </>
  );
}

function AppLayout() {
  const [verified, setVerified] = useState<boolean | null>(null);
  const [location] = useLocation();

  useEffect(() => {
    setVerified(isAgeVerified());
  }, []);

  // Admin + affiliate routes bypass the age gate and storefront chrome.
  if (location.startsWith("/admin") || location.startsWith("/affiliate")) {
    return (
      <Switch>
        <Route path="/admin/login" component={AdminLogin} />
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/affiliate/login" component={AffiliateLogin} />
        <Route path="/affiliate/dashboard" component={AffiliateDashboard} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  // Customer auth pages keep storefront chrome but skip the age gate.
  const isAuthPage = location === "/login" || location === "/account";

  // Show nothing until we've checked the cookie (avoids flash)
  if (verified === null && !isAuthPage) return null;

  const gated = !verified && !isAuthPage;

  return (
    <>
      {gated && (
        <AgeGate onVerified={() => setVerified(true)} />
      )}
      <div className={gated ? "pointer-events-none select-none blur-sm" : ""}>
        <Navbar />
        <main>
          <Router />
        </main>
        <Footer />
        <CookieConsent />
        <BackToTop />
      </div>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable={true}>
        <TooltipProvider>
          <AuthProvider>
            <CartProvider>
              <Toaster />
              <AppLayout />
              <CartDrawer />
              <Analytics />
            </CartProvider>
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
