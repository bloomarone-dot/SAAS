import { cleanPathname } from "@/core/routing/navigate";
import HomePage from "@/apps/marketing/pages/HomePage";
import LoginPage from "@/apps/marketing/pages/LoginPage";

const MARKETING_SECTIONS = {
  "/": null,
  "/features": "features",
  "/pricing": "pricing",
  "/contact": "request-instance",
};

export function isMarketingPath(path = window.location.pathname) {
  const clean = cleanPathname(path);
  return clean === "/login" || Object.prototype.hasOwnProperty.call(MARKETING_SECTIONS, clean);
}

/**
 * Site vitrine SaaS global :
 * / · /features · /pricing · /contact · /login
 */
export function MarketingRoutes({
  path,
  apiBaseUrl,
  message,
  recoveryMode,
  onAuthenticated,
  onForgotPassword,
  onBackFromRecovery,
}) {
  const clean = cleanPathname(path);

  if (clean === "/login" || clean === "/admin") {
    return (
      <LoginPage
        apiBaseUrl={apiBaseUrl}
        message={message}
        recoveryMode={recoveryMode}
        onAuthenticated={onAuthenticated}
        onForgotPassword={onForgotPassword}
        onBackFromRecovery={onBackFromRecovery}
      />
    );
  }

  if (Object.prototype.hasOwnProperty.call(MARKETING_SECTIONS, clean)) {
    return <HomePage apiBaseUrl={apiBaseUrl} initialSection={MARKETING_SECTIONS[clean]} />;
  }

  return <HomePage apiBaseUrl={apiBaseUrl} />;
}
