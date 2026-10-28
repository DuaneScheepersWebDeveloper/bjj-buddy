"""Sends emails from the API.

Which method is used is set by EMAIL_BACKEND in Backend/.env:

  EMAIL_BACKEND=console   (default) - prints the email in the terminal running the API.
                          Handy while building: no email account needed.

  EMAIL_BACKEND=smtp      - sends a real email. For Gmail:
      SMTP_HOST=smtp.gmail.com
      SMTP_PORT=587
      SMTP_USERNAME=you@gmail.com
      SMTP_PASSWORD=<a Gmail "App Password", not your normal password>
      EMAIL_FROM=BJJ Buddy <you@gmail.com>
"""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.config import settings

log = logging.getLogger("email")


def send_email(to: str, subject: str, body: str) -> None:
    """Send a plain-text email. Raises on failure so the caller can decide what to do."""
    backend = (settings.email_backend or "console").lower()

    if backend == "console":
        line = "=" * 64
        print(f"\n{line}\n  EMAIL (console mode - not actually sent)\n  To:      {to}\n"
              f"  Subject: {subject}\n{line}\n{body}\n{line}\n", flush=True)
        return

    if backend == "smtp":
        if not settings.smtp_host:
            raise RuntimeError("EMAIL_BACKEND=smtp but SMTP_HOST is not set in .env")
        msg = EmailMessage()
        msg["From"] = settings.email_from or settings.smtp_username or "BJJ Buddy <no-reply@localhost>"
        msg["To"] = to
        msg["Subject"] = subject
        msg.set_content(body)

        context = ssl.create_default_context()
        if settings.smtp_port == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=context, timeout=15) as smtp:
                if settings.smtp_username:
                    smtp.login(settings.smtp_username, settings.smtp_password or "")
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
                smtp.starttls(context=context)
                if settings.smtp_username:
                    smtp.login(settings.smtp_username, settings.smtp_password or "")
                smtp.send_message(msg)
        return

    raise RuntimeError(f"Unknown EMAIL_BACKEND '{backend}' (use 'console' or 'smtp')")
