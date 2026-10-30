# Login / logout

| Endpoint | What it does |
|---|---|
| `POST /auth/login` `{email, password}` | Returns `{access_token, expires_at, user}` |
| `POST /auth/register` `{full_name, email, password}` | Creates an account (password 8+ chars) and logs in |
| `GET /auth/me` | The logged-in user |
| `POST /auth/logout` | Ends this device's session — the token stops working immediately |
| `POST /auth/logout-all` | Ends every session for this user |

Send the token on every request that needs a logged-in user:

    Authorization: Bearer <access_token>

In Swagger (`/docs`), click **Authorize** and paste the token.

## How it works

- Passwords are hashed with scrypt (Python standard library, nothing to install).
- Tokens are random strings; only their SHA-256 hash is stored, in the `auth_token`
  table (created automatically on startup). They last 30 days (`TOKEN_LIFETIME` in `app/security.py`).
- Users created before login existed had plain-text passwords. They can still log in,
  and their password is converted to a hash the first time they do.
- To protect an endpoint: `user: User = Depends(get_current_user)` (from `app.security`).

## Forgot password

| Endpoint | What it does |
|---|---|
| `POST /auth/forgot-password` `{email}` | Emails a 6-digit code (valid 15 minutes). Always replies the same way, so it can't be used to check who has an account |
| `POST /auth/reset-password` `{email, code, new_password}` | Sets the new password, logs out every other device, and logs you in |

- Max 5 wrong code attempts, then a new code is needed. A new code can be requested once a minute.
- Codes are stored as a keyed hash (using `SECRET_KEY`) in the `password_reset_code` table.

### Where the email goes

By default (`EMAIL_BACKEND=console`) the email is **printed in the terminal running the API** —
look for the `EMAIL (console mode - not actually sent)` box.

To send real emails through Gmail, add this to `Backend/.env`:

    EMAIL_BACKEND=smtp
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=587
    SMTP_USERNAME=you@gmail.com
    SMTP_PASSWORD=your-16-character-app-password
    EMAIL_FROM=BJJ Buddy <you@gmail.com>

The password must be a Gmail **App Password** (Google Account → Security → 2-Step Verification →
App passwords), not your normal Gmail password. Any other SMTP provider works the same way.

## User roles: admin and normal users

Every user has a `role`: `user` (default) or `admin`. It's included in every user object the API returns.

### Make your first admin

Sign up in the app as normal, then from the `Backend` folder (with the virtual environment active):

    python -m app.make_admin you@example.com
    python -m app.make_admin you@example.com --remove   # back to a normal user

Close and reopen the app. **Admin** now appears in the menu.

### What admins can do

| Endpoint | What it does |
|---|---|
| `GET /admin/users?search=&active=&role=` | List users, optionally filtered |
| `GET /admin/summary` | Counts: total, active, inactive, admins |
| `GET /admin/users/{id}` | One user's details |
| `PATCH /admin/users/{id}` `{full_name, email, belt_rank, stripes, role, is_active}` | Edit any of these (send only what changes). Belt must be White, Blue, Purple, Brown or Black; stripes 0–4 |
| `PATCH /admin/users/{id}/status` `{is_active}` | Activate or deactivate a user. Deactivating logs them out everywhere immediately |
| `PATCH /admin/users/{id}/role` `{role}` | Make someone an admin, or a normal user |
| `GET/POST/PATCH/DELETE /users/...` | Full access to any account |

Admins can't deactivate, demote or delete **themselves**, so you can't lock yourself out.
They can still edit their own name, email, belt and stripes.
Users with logged training sessions can't be deleted (deactivate them instead), so no history is lost.

### What normal users can do

- `GET /users/{id}` and `PATCH /users/{id}` for **their own** account only.
- Everything under `/auth`.

A deactivated user gets "This account has been deactivated" when they try to log in.

### Protecting new endpoints

    from app.security import get_current_user, require_admin

    def any_logged_in_user(user: User = Depends(get_current_user)): ...
    def admins_only(admin: User = Depends(require_admin)): ...
