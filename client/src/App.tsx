/*
 * App.tsx — Vitum Lab
 * Design: Contemporary Clinical
 * Routes, layout wrapper, age gate logic
 */

import { Toaster } from "@/components/ui/sonner";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { lazy, Suspense, useEffect, useState } from "react";
import AgeGate from "./components/AgeGate";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import CookieConsent from "./components/CookieConsent";
import CartDrawer from "./components/CartDrawer";
import BackToTop from "./components/BackToTop";
import { CartProvider } from "./contexts/CartContext";
import { capturePromoFromUrl } from "./lib/promo";
import Home from "./pages/Home";
import { AuthProvider } from "./contexts/AuthContext";
import { Analytics } from "@vercel/analytics/react";

// Keep the landing page eager and split every secondary surface by route. In
// particular, charting/admin and payment SDK code should never delay the first
// storefront render.
const Shop = lazy(() => import("./pages/Shop"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const COALibrary = lazy(() => import("./pages/COALibrary"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const FAQ = lazy(() => import("./pages/FAQ"));
const ShippingPolicy = lazy(() => import("./pages/ShippingPolicy"));
const ReturnPolicy = lazy(() => import("./pages/ReturnPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const ResearchDisclaimer = lazy(() => import("./pages/ResearchDisclaimer"));
const DoseCalculator = lazy(() => import("./pages/DoseCalculator"));
const Research = lazy(() => import("./pages/Research"));
const Referral = lazy(() => import("./pages/Referral"));
const Checkout = lazy(() => import("./pages/Checkout"));
const OrderTracking = lazy(() => import("./pages/OrderTracking"));
const OrderSuccess = lazy(() => import("./pages/OrderSuccess"));
const OrderCancel = lazy(() => import("./pages/OrderCancel"));
const Login = lazy(() => import("./pages/Login"));
const Account = lazy(() => import("./pages/Account"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AffiliateLogin = lazy(() => import("./pages/AffiliateLogin"));
const AffiliateDashboard = lazy(() => import("./pages/AffiliateDashboard"));

function RouteFallback() {
  return <div className="min-h-[45vh]" aria-busy="true" aria-label="Loading page" />;
}

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
      <Route path="/reconstitution-calculator" component={DoseCalculator} />
      <Route path="/dose-calculator" component={DoseCalculator} />
      <Route path="/research" component={Research} />
      <Route path="/referral" component={Referral} />
      <Route path="/checkout" component={Checkout} />
      <Route path="/track" component={OrderTracking} />
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
    // Capture a shared affiliate/promo code from the landing URL (?code=…).
    capturePromoFromUrl();
  }, []);

  // Admin + affiliate routes bypass the age gate and storefront chrome.
  if (location.startsWith("/admin") || location.startsWith("/affiliate")) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Switch>
          <Route path="/admin/login" component={AdminLogin} />
          <Route path="/admin" component={AdminDashboard} />
          <Route path="/affiliate/login" component={AffiliateLogin} />
          <Route path="/affiliate/dashboard" component={AffiliateDashboard} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
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
        {/* Keyboard users skip the marquee + nav stack straight to content */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[10000] focus:bg-white focus:text-[oklch(0.13_0.01_260)] focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg text-sm font-semibold"
        >
          Skip to main content
        </a>
        <Navbar />
        <main id="main">
          <Suspense fallback={<RouteFallback />}>
            <Router />
          </Suspense>
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
        <AuthProvider>
          <CartProvider>
            <Toaster />
            <AppLayout />
            <CartDrawer />
            <Analytics />
          </CartProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
