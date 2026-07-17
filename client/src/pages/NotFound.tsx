import { Link } from "wouter";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] w-full flex items-center justify-center bg-page px-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-[oklch(0.93_0.004_260)] shadow-[0_2px_16px_oklch(0.13_0.01_260/0.08)] py-12 px-8 text-center">
        <p className="font-mono text-[3rem] font-bold leading-none text-[oklch(0.40_0.16_260)] mb-4">404</p>

        <h1 className="text-[1.25rem] font-bold text-[oklch(0.13_0.01_260)] mb-2">Page Not Found</h1>

        <p className="text-[0.9375rem] text-[oklch(0.52_0.01_260)] leading-relaxed mb-8">
          Sorry, the page you are looking for doesn't exist. It may have been moved or deleted.
        </p>

        <Link href="/" className="btn-primary inline-flex">
          <Home className="w-4 h-4" /> Go Home
        </Link>
      </div>
    </div>
  );
}
