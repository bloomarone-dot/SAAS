"""Brique d'envoi d'emails (réutilisable : reset mot de passe, notifications...).

Configuration via variables d'environnement (aucune valeur en dur) :
  SMTP_HOST, SMTP_PORT (défaut 587), SMTP_USERNAME, SMTP_PASSWORD,
  SMTP_FROM (défaut = SMTP_USERNAME), SMTP_SSL (false), SMTP_STARTTLS (true),
  APP_PUBLIC_URL (pour construire les liens), APP_NAME (défaut "Bloomar One").

Si SMTP_HOST n'est pas défini, l'email est journalisé au lieu d'être envoyé
(pratique en dev) et la fonction renvoie False sans lever d'exception.
"""
import logging
import os
import re
import smtplib
import ssl
from email.message import EmailMessage

logger = logging.getLogger(__name__)


def _bool_env(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


def is_email_configured() -> bool:
    return bool(os.getenv("SMTP_HOST"))


def app_name() -> str:
    return os.getenv("APP_NAME", "Bloomar One")


def _strip_html(html: str) -> str:
    text = re.sub(r"<(br|/p|/div|/h[1-6])\s*>", "\n", html, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def send_email(to: str, subject: str, html_body: str, text_body: str | None = None) -> bool:
    """Envoie un email. Renvoie True si remis au serveur SMTP, False sinon."""
    host = os.getenv("SMTP_HOST")
    if not host or not to:
        logger.info("Email non envoyé (SMTP non configuré ou destinataire vide) -> %s | %s", to, subject)
        return False

    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_PASSWORD")
    sender = os.getenv("SMTP_FROM") or username or "no-reply@bloomar.one"

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{app_name()} <{sender}>"
    message["To"] = to
    message.set_content(text_body or _strip_html(html_body))
    message.add_alternative(html_body, subtype="html")

    try:
        if _bool_env("SMTP_SSL", "false"):
            with smtplib.SMTP_SSL(host, port, context=ssl.create_default_context(), timeout=20) as server:
                if username:
                    server.login(username, password or "")
                server.send_message(message)
        else:
            with smtplib.SMTP(host, port, timeout=20) as server:
                if _bool_env("SMTP_STARTTLS", "true"):
                    server.starttls(context=ssl.create_default_context())
                if username:
                    server.login(username, password or "")
                server.send_message(message)
        logger.info("Email envoyé à %s (%s)", to, subject)
        return True
    except Exception:  # un échec d'email ne doit jamais casser l'action métier
        logger.exception("Échec d'envoi d'email à %s", to)
        return False


def _layout(title: str, body_html: str) -> str:
    return f"""\
<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
  <h2 style="color:#078d50;margin:0 0 16px">{app_name()}</h2>
  <h3 style="margin:0 0 12px">{title}</h3>
  {body_html}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
  <p style="font-size:12px;color:#9ca3af">Email automatique — merci de ne pas répondre.</p>
</div>"""


def send_password_reset_email(to: str, reset_link: str, expires_minutes: int) -> bool:
    """Envoie le lien de réinitialisation de mot de passe."""
    body = (
        f"<p>Vous avez demandé la réinitialisation de votre mot de passe.</p>"
        f"<p><a href=\"{reset_link}\" style=\"display:inline-block;background:#078d50;color:#fff;"
        f"padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold\">"
        f"Réinitialiser mon mot de passe</a></p>"
        f"<p style=\"font-size:13px;color:#6b7280\">Ou copiez ce lien : <br>{reset_link}</p>"
        f"<p style=\"font-size:13px;color:#6b7280\">Ce lien expire dans {expires_minutes} minutes. "
        f"Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>"
    )
    return send_email(to, f"{app_name()} — Réinitialisation du mot de passe", _layout("Réinitialisation du mot de passe", body))


def send_notification_email(to: str, title: str, message: str) -> bool:
    """Email générique pour une notification métier critique."""
    body = f"<p>{message}</p>"
    return send_email(to, f"{app_name()} — {title}", _layout(title, body))
