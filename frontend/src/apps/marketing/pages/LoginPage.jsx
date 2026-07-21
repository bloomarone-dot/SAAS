import { PasswordRecovery, SuperAdminLoginPage } from "@/core/auth";

/**
 * Connexion SaaS plateforme (SUPERADMIN).
 * Les comptes restaurant se connectent via /restaurant/:slug/login
 * (ou sous-domaine dédié), pas via ce formulaire.
 */
export default function LoginPage({
  apiBaseUrl,
  onAuthenticated,
  recoveryMode,
  onBackFromRecovery,
}) {
  if (recoveryMode) {
    return (
      <PasswordRecovery
        apiBaseUrl={apiBaseUrl}
        mode="forgot"
        onBackToLogin={onBackFromRecovery}
      />
    );
  }

  return <SuperAdminLoginPage apiBaseUrl={apiBaseUrl} onAuthenticated={onAuthenticated} />;
}
