# Login / logout

| Endpoint | What it does |
|---|---|
| `POST /auth/login` `{login, password}` | Log in with **email or username** (`login`). Returns `{access_token, expires_at, user}` |
| `POST /auth/register` `{full_name, username, email, password}` | Creates an account (password 8+ chars) and logs in |
| `GET /auth/me` | The logged-in user |
| `PATCH /auth/me` `{full_name, username, email, gym, favourite_sub, birthday, country}` | Edit your own profile (send only what changes; `null` or `""` clears gym/sub/birthday/country). `age` is calculated from `birthday`. Belt, stripes, role and status are admin-only |
| `PUT /auth/me/avatar` `{image_base64}` | Set your profile picture (JPG, PNG or WebP, max 5 MB). Returns the user with `avatar_url` |
| `DELETE /auth/me/avatar` | Remove your profile picture |
| `POST /auth/logout` | Ends this device's session — the token stops working immediately |
| `POST /auth/logout-all` | Ends every session for this user |

Profile pictures are saved in `Backend/uploads/avatars/` (git-ignored) and served at `/uploads/avatars/...`.
The app adds the API address in front of `avatar_url` to load them.

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

## Usernames

Every account can have a username as a second way to sign in. Sign-up asks for one; accounts
created before usernames existed don't have one until an admin sets it (Admin → tap the user).

- 3–30 characters: letters, numbers, dots and underscores, starting with a letter or number.
- Stored in lowercase and unique (`Duane_BJJ` and `duane_bjj` are the same).
- Can't contain `@`. That's how the login form tells a username from an email.
- A few names are reserved (`admin`, `support`, `root`, `bjjbuddy`, …). See `app/usernames.py`.
- Password reset still goes by email.

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
| `PATCH /admin/users/{id}` `{full_name, email, username, belt_rank, stripes, role, is_active}` | Edit any of these (send only what changes). Belt must be White, Blue, Purple, Brown or Black; stripes 0–4 |
| `PATCH /admin/users/{id}/status` `{is_active}` | Activate or deactivate a user. Deactivating logs them out everywhere immediately |
| `PATCH /admin/users/{id}/role` `{role}` | Make someone an admin, or a normal user |
| `GET/POST/PATCH/DELETE /users/...` | Full access to any account |

### Admin tasks (shared to-do list)

| Endpoint | What it does |
|---|---|
| `GET /admin/tasks` | All tasks: open ones (newest first), then completed |
| `POST /admin/tasks` `{id, title, created_at?}` | Add a task. The app makes the `id` (a UUID) so tasks can be added and edited offline. Re-sending the same `id` just returns the task |
| `PATCH /admin/tasks/{id}` `{title?, done?}` | Rename or tick off / reopen |
| `DELETE /admin/tasks/{id}` | Delete (deleting one that's already gone still succeeds) |

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
