# BJJ Buddy

A training tracker for Brazilian Jiu-Jitsu. Log your sessions, follow your belt progress, and see how your training adds up.

> **Status:** early development. Login, sign-up, log out, password reset and admin user management work. The home screen has a main menu; most sections are placeholders for now.

## What's in here

```
BJJ Buddy/
├── Backend/     Python API (FastAPI + PostgreSQL)
└── Mobile/      The app (Expo / React Native: runs on Android, iOS and in a web browser)
```

## Requirements

- **Python 3.11+**
- **Node.js 20+**
- **Docker Desktop** (runs the PostgreSQL database)
- **Git Bash** on Windows (to run `start.sh`)
- Optional: **Expo Go** on your phone, to try the app on a real device

---

## 1. Backend setup (first time only)

```bash
cd Backend
python -m venv .venv
source .venv/Scripts/activate        # macOS/Linux: source .venv/bin/activate
pip install fastapi "uvicorn[standard]" sqlmodel pydantic-settings "psycopg[binary]"
```

Create `Backend/.env`:

```env
DATABASE_URL=postgresql://postgres:dev@localhost:5432/bjjbuddy
SECRET_KEY=change-me-to-a-long-random-string

# Optional (these are the defaults)
ENVIRONMENT=development
EMAIL_BACKEND=console
```

To make a good `SECRET_KEY`, run `python -c "import secrets; print(secrets.token_urlsafe(48))"`.

> `.env` holds secrets and is git-ignored. Never commit it.

## 2. Run the backend

```bash
cd Backend
./start.sh
```

This starts the Postgres container in Docker (creating it the first time), activates the virtual environment and runs the API on **http://localhost:8000**. It reloads by itself when you change a file. Database tables are created automatically on startup.

- Interactive API docs: **http://localhost:8000/docs**
- Health check: http://localhost:8000/health

## 3. Mobile app setup (first time only)

```bash
cd Mobile
npm install
npx expo install expo-secure-store react-dom react-native-web @expo/metro-runtime
```

**No `.env` needed.** The app finds the backend by itself: `localhost:8000` in a browser, and your PC's Wi-Fi IP (taken from the Expo dev server) on a phone. Only set `EXPO_PUBLIC_API_URL` in `Mobile/.env` to point at a different server. See `.env.example`.

> Phones must be on the **same Wi-Fi** as your PC. The first time, Windows may ask whether to let Python through the firewall: allow it on **private networks**.

## 4. Run the app

```bash
cd Mobile
npx expo start --web     # in your browser
npx expo start           # then scan the QR code with Expo Go on your phone
```

**Tip:** in the browser, press `F12` then `Ctrl+Shift+M` to view it at phone size.

---

## Accounts and login

| Endpoint | What it does |
|---|---|
| `POST /auth/register` | Create an account (password 8+ characters) and log in |
| `POST /auth/login` | Log in. Returns an `access_token` |
| `GET /auth/me` | The logged-in user |
| `POST /auth/logout` | Log out of this device |
| `POST /auth/logout-all` | Log out of every device |
| `POST /auth/forgot-password` | Email a 6-digit reset code |
| `POST /auth/reset-password` | Set a new password with the code |

- Send the token on requests as `Authorization: Bearer <token>`. In `/docs`, click **Authorize** and paste it.
- In the app, the token is stored in the phone's secure storage (the browser's localStorage on web), so you stay logged in for 30 days.
- **Admins:** run `python -m app.make_admin you@example.com` in `Backend` to make yourself an admin. Admins get an **Admin** screen in the menu to edit, activate and deactivate users. See [`Backend/AUTH.md`](Backend/AUTH.md).
- **Password reset codes are printed in the backend terminal** while `EMAIL_BACKEND=console`. To send real emails via Gmail, see [`Backend/AUTH.md`](Backend/AUTH.md).

## Project layout

```
Backend/
├── app/
│   ├── main.py              App setup, routers, middleware
│   ├── config.py            Settings read from .env
│   ├── database.py          DB connection, table creation, simple column migrations
│   ├── security.py          Password hashing, login tokens, get_current_user
│   ├── email_sender.py      Sends emails (console or SMTP)
│   ├── make_admin.py        Command to make a user an admin
│   ├── schemas.py           Shapes of data the API returns
│   ├── error_logging.py     Error capture into the error_log table
│   ├── error_middleware.py
│   ├── models/              Database tables (user, session, auth_token, password_reset_code, error_log)
│   └── routers/             Endpoints: auth, admin, users, sessions, errors
├── sql/error_queries.sql    Handy queries for reading error logs
├── AUTH.md                  Login and password reset details
├── ERROR_LOGGING.md         How error logging works
└── start.sh                 Starts the DB and API

Mobile/
├── App.tsx                  Entry: shows login or home depending on login state
├── src/
│   ├── auth/AuthContext.tsx Login state and sign in / out / reset actions
│   ├── screens/             LoginScreen, ForgotPasswordScreen, HomeScreen, AdminUsersScreen, AdminEditUser, SectionPlaceholder
│   ├── components/          AuthLayout, MainMenu, HamburgerButton, TextField, PrimaryButton, BeltMark, ErrorBoundary
│   ├── navigation/          menuItems.ts: the sections in the main menu
│   ├── lib/                 api.ts (talks to the backend), tokenStorage.ts, errorReporter.ts
│   └── theme.ts             Colours, belt colours, spacing
└── AGENTS.md                Notes for AI coding assistants working on the app
```

## Good to know

- **Adding a field to a model?** `create_all` only creates new tables. It doesn't add columns to existing ones. Add an `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` line to the list in `Backend/app/database.py` (or move to Alembic migrations later).
- **Protecting an endpoint:** add `user: User = Depends(get_current_user)` (any logged-in user) or `admin: User = Depends(require_admin)` (admins only), both from `app.security`.
- **Errors** from the API and the app are saved to the `error_log` table. See [`Backend/ERROR_LOGGING.md`](Backend/ERROR_LOGGING.md).
- **Quieter terminal:** set `echo=False` in `Backend/app/database.py` to stop printing every SQL query.

## Troubleshooting

| Problem | Fix |
|---|---|
| `Docker Desktop is not running` | Open Docker Desktop, wait for it to start, run `./start.sh` again |
| App says "Can't reach the server" | Check the backend is running. Remove any `localhost` or old IP `EXPO_PUBLIC_API_URL` from `Mobile/.env` and restart Expo. The error shows the address it tried |
| `Unable to resolve module expo-secure-store` | Run `npx expo install expo-secure-store` in `Mobile` |
| `column ... does not exist` | A model gained a field your existing table doesn't have. See "Adding a field to a model" above |
| `Port 8081 is being used` | Another Expo server is still running. Press `Y` to use another port, or close the other terminal |
| Phone can't connect but the browser can | Allow Python through Windows Firewall on private networks, and make sure the phone is on the same Wi-Fi |

## Roadmap

- [ ] Decide on and build the home screen
- [ ] Log training sessions from the app
- [x] Lock `/users` endpoints to the logged-in user / admins
- [ ] Lock `/sessions` endpoints to the logged-in user
- [ ] Belt and stripe progress tracking
- [ ] Real email sending for password reset
- [ ] Alembic database migrations
- [ ] `requirements.txt` for the backend
