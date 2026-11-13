# BJJ Buddy

A training tracker for Brazilian Jiu-Jitsu. Log your sessions, follow your belt progress, and see how your training adds up.

> **Status:** early development. Login, accounts, profiles, admin tools and **logging training sessions** work. Stats, Your BJJ plan and Support are placeholders for now.

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
pip install -r requirements.txt
```

Copy `Backend/.env.example` to `Backend/.env` and fill it in:

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
npx expo install expo-secure-store expo-constants expo-image-picker expo-audio expo-file-system react-native-svg @react-native-async-storage/async-storage react-dom react-native-web @expo/metro-runtime
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
| `POST /auth/register` | Create an account (name, username, email, password 8+ characters) and log in |
| `POST /auth/login` | Log in with email **or username**. Returns an `access_token` |
| `GET /auth/me` | The logged-in user |
| `PATCH /auth/me` | Edit your own profile (name, username, email, gym, favourite sub, birthday, country) |
| `PUT` / `DELETE /auth/me/avatar` | Set or remove your profile picture |
| `POST /auth/logout` | Log out of this device |
| `POST /auth/logout-all` | Log out of every device |
| `POST /auth/forgot-password` | Email a 6-digit reset code |
| `POST /auth/reset-password` | Set a new password with the code |

- Send the token on requests as `Authorization: Bearer <token>`. In `/docs`, click **Authorize** and paste it.
- In the app, the token is stored in the phone's secure storage (the browser's localStorage on web), so you stay logged in for 30 days.
- **Admins:** run `python -m app.make_admin you@example.com` in `Backend` to make yourself an admin. Admins get an **Admin** section in the menu: **Users** (edit, activate and deactivate users) and **Tasks** (a shared to-do list for ideas that works offline). See [`Backend/AUTH.md`](Backend/AUTH.md).
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
│   ├── avatars.py           Profile picture checks and file storage
│   ├── idempotency.py       Makes outbox retries safe (no duplicates)
│   ├── make_admin.py        Command to make a user an admin
│   ├── techniques_seed.py   Built-in BJJ technique library
│   ├── voice.py             Voice notes and voice dump: speech to text, then tidy up / fill in the log (OpenAI)
│   ├── usernames.py         Username rules (format, reserved names, uniqueness)
│   ├── schemas.py           Shapes of data the API returns
│   ├── error_logging.py     Error capture into the error_log table
│   ├── error_middleware.py
│   ├── models/              Database tables (user, training_session, session_entry, technique, auth_token, ...)
│   └── routers/             Endpoints: auth, admin, admin_tasks, coach, fitness, focus, users, sessions, voice, errors
├── sql/error_queries.sql    Handy queries for reading error logs
├── uploads/                 Profile pictures (created automatically, not in git)
├── AUTH.md                  Login and password reset details
├── ERROR_LOGGING.md         How error logging works
└── start.sh                 Starts the DB and API

Mobile/
├── App.tsx                  Entry: shows login or home depending on login state
├── src/
│   ├── auth/AuthContext.tsx Login state and sign in / out / reset actions
│   ├── screens/             LoginScreen, ForgotPasswordScreen, HomeScreen, QuickLogScreen, LogSessionScreen, FocusScreen, StudentsScreen, FitnessScreen, ProfileScreen, SettingsScreen, AdminUsersScreen, AdminEditUser, AdminTasksScreen, SectionPlaceholder
│   ├── components/          FocusCard (+ InsightCard), Reflection (focus check, energy, partners), VoiceNote, TechniquePicker, Avatar, WeekWidget, AuthLayout, MainMenu, HamburgerButton, TextField, PrimaryButton, BeltMark, ErrorBoundary
│   ├── navigation/          menuItems.ts: the sections in the main menu
│   ├── sessions/            Training sessions: types and SessionsContext (offline-first store)
│   ├── focus/               FocusContext: your one active focus (offline-first store)
│   ├── insights/            insights.ts: rule-based insights, focus progress, feedback after logging (pure functions)
│   ├── offline/             Offline outbox: save changes without signal, upload later
│   ├── data/                countries.ts (profile), techniques.ts (offline copy of the technique library)
│   ├── lib/                 api.ts (talks to the backend), exportData.ts (JSON / CSV export), week.ts (weekly counts/streaks), tokenStorage.ts, errorReporter.ts
│   ├── theme.ts             Light and dark colour palettes, belt colours, spacing
│   └── ThemeContext.tsx     Light/dark mode: ThemeProvider, useTheme(), makeStyles()
└── AGENTS.md                Notes for AI coding assistants working on the app
```

How the pieces fit together, and why: [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Stats

**Menu → Stats** opens into two pages:

- **Fitness**
  - **Water today:** tap **+ Glass** (250 ml) or **+ Bottle** (500 ml), or **−** to undo. It shows progress to a daily goal (default 2.5 L, change it with **Goal ✎**), plus yesterday's total and your average over the last week.
  - **Weight:** log today's weight (− / + steps of 0.1 kg, or type it in). See a chart for the last 30 days, 3 months or year, and your change over 30 days. You can set an optional **target** (shown as a dashed line), and delete any entry from **Recent**.
  - Both work offline and upload later. The water goal and target weight are remembered on the phone.
- **BJJ progress**: a placeholder for now (ideas: sub tally, most-used techniques, Gi vs No-Gi, mat hours).

| Endpoint | What it does |
|---|---|
| `GET /fitness/weights?days=365` | Your weigh-ins, oldest first |
| `PUT` / `DELETE /fitness/weights/{YYYY-MM-DD}` | Log (`{weight_kg}`, 20–300) or delete that day's weight |
| `GET /fitness/water?days=30` | Water per day |
| `PUT /fitness/water/{YYYY-MM-DD}` | That day's total (`{ml}`; 0 clears it) |

## Coaches

There are three kinds of user: **User** (logs their own training), **Coach** and **Admin**. An admin makes someone a coach in **Menu → Admin → Users → (person) → Role → Coach**.

A coach's **students** are everyone whose profile **gym** matches the coach's gym (capitals and extra spaces don't matter). Coaches get **Menu → Coach → Students**, where they can:

- see each student's sessions: what went right and wrong, subs, techniques and what they're working on
- **promote** them: change belt and stripes
- leave a **note** on any session. The student sees it as **From your coach** on that session, with a marker on the home page.

Admins can do everything a coach can, for every user. The server enforces the gym rule, so a coach can't see or change anyone at another gym.

| Endpoint | What it does |
|---|---|
| `GET /coach/students` | Your students, with sessions in the last 30 days and when they last trained |
| `GET /coach/students/{id}/sessions` | A student's sessions, including notes |
| `PATCH /coach/students/{id}/rank` | Set belt and stripes `{belt_rank, stripes}` |
| `PUT` / `DELETE /coach/sessions/{id}/note` | Add, change or remove your note (`{text}`, up to 1000 characters) |

## Your focus (the practice loop)

The app is built around one loop: **pick ONE thing → work on it → log it → review it → pick the next thing.**

- **Menu → Focus** (or the **Your focus** card at the top of the home page): name one specific thing, e.g. "Knee-cut pass". Ideas are suggested from what's been catching you lately. Choose how many sessions before you review it (default 8).
- Each time you log a session, **Worked on my focus** is ticked for you (untick it if you didn't).
- The card shows your reps (e.g. **3/8**), a progress bar and one line: your last "next time" note, how many sessions to go, **time to review** when you hit the target, or a nudge if you haven't worked on it in 10 days.
- **Review or change**: **Got it** or **Park it** (add what you learned, then pick the next focus), or **Keep going** (adds 4 more sessions). Old focuses stay under **Past focuses**.
- Only one focus is active at a time. Starting a new one ends the old one (the server enforces this too).

| Endpoint | What it does |
|---|---|
| `GET /focus` | Your focuses, active first |
| `PUT /focus/{id}` | Start, change or end one (the app makes the id, so offline retries are safe) |
| `DELETE /focus/{id}` | Remove one |

## Insights

Under **Noticed lately** on the home page you get the one or two most useful observations from your own logs, worked out on the phone (no AI, works offline). Each rule waits for enough data before it says anything:

- **Partners**: a partner type that taps you far more than usual (e.g. "Bigger partners are your hardest rolls: tapped in 7 of 9").
- **Energy**: three tiring sessions in a row, or you get tapped much more on tired days.
- **Cold techniques**: something you used to hit that you haven't in 3+ weeks.
- **Where you get tapped**: e.g. most taps happen from underneath.
- **Neglected**: no sweeps (or passes, escapes…) logged in 30 days.
- **Streak**: weeks in a row with at least one session, and a nudge when a streak is at risk.

Right after saving a session you get a few lines of feedback: your focus rep count, firsts and comebacks ("Armbar is back after 24 days"), and a new streak. Rules live in `Mobile/src/insights/insights.ts`; adding one is a small function.

## Logging a session

**Log a session** opens **Quick log**: the whole session on one screen, built to take under a minute.

- **Talk it through** (voice dump): say how it went in one go: what you worked on, what worked and didn't, who you rolled with, how you felt, one thing to change. It fills in the form (techniques matched to the library, partners, energy, focus); you check it and save. Needs voice notes set up (below). Uses `POST /voice/session`.
- **Or tap**: where / how long / Gi or No-Gi come from your last session (**Change** to edit them); **Worked on my focus**; what worked / what didn't; subs you got and what tapped you (your usual ones first); **Energy** (1–5); **Who did you roll with?** (a name, or just traits like Bigger / Higher belt, and who tapped whom; your regulars are one tap); and **One thing to change next time**.
- **Full log ›** moves everything you've entered into the detailed log.

The detailed log (**Detailed log (4 steps)** on the home page, and always used for editing) has four short pages:

1. **Details**: when (**Today**, or **Pick a day** for a calendar; days you've already logged have a dot), where (your recent places are one tap away), how long, Gi or No-Gi, and class / open mat / private / competition.
2. **What went right**: notes first, then the **subs you got** (with a counter) and other techniques that worked.
3. **What went wrong**: notes, **what you got submitted with**, what you'll work on, and the **Reflection** (focus, energy, partners, one thing to change).
4. **Review**: your score for the day (subs vs taps). Tap **Edit** on any part, then save.

- Every technique has a little **stick-figure icon** (you in red, your partner in grey; swapped when it was done to you). There are 12 pictures (takedown, guard, pass, sweep, mount, side control, back control, armlock, choke, triangle, leg lock, escape), and each technique gets the one that fits, including ones you add yourself. They're drawn in `Mobile/src/sessions/techniqueIcons.ts` (needs `react-native-svg`).
- Pick techniques by searching, or filter by **position** (standing / top / bottom) and **type** (submission, pass, sweep, escape, takedown, position). Tap again or use **+ / −** to count repeats. Anything not in the list can be added by name.
- Unfinished logs are kept on the phone, so closing the app mid-log doesn't lose anything.
- Saving works **offline** and uploads later.
- The home page shows your **training week** (weekly goal and streak). **Tap a day with a session** to see that day's sessions, and use **‹ ›** to look at earlier weeks. Tap a session to see, edit or delete it.

### Voice notes

Under each notes box there's **Record instead**. Talk it through, tap **Done**, and a few seconds later you get clear, tidy notes, with BJJ terms spelled right. Choose **Use this** / **Add to my notes**, **Replace**, or **Discard**. You can also see exactly what you said word for word. If you record with no signal, it's kept and turned into text when you're back online. Recordings are never saved on the server.

**Setup (once):**

1. `expo-audio` and `expo-file-system` must be installed in `Mobile` (`npx expo install expo-audio expo-file-system`). Then restart Expo.
2. Get an API key at <https://platform.openai.com/api-keys> and add a few dollars of credit under Billing. **Never paste the key into a chat or commit it.**
3. Add it to `Backend/.env` and restart the API:

```env
OPENAI_API_KEY=sk-...
# Optional:
VOICE_MAX_SECONDS=300          # longest recording; up to 600 (10 minutes)
VOICE_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
VOICE_TIDY_MODEL=gpt-4.1-mini  # the model that tidies the text. If it's unavailable or slower than 20 s, the API tries others or gives you the word-for-word text
```

Each voice note prints a line in the API terminal showing how long each step took, e.g. `Voice note: 0.12 MB m4a | speech-to-text 2.3s | tidy-up 1.4s (gpt-4.1-mini) | total 3.8s`.

**Cost:** roughly $0.003 per minute of speech, plus a fraction of a cent to tidy it, so a 3-minute note costs about one US cent. Set a monthly spend limit under **Billing → Limits** on the OpenAI site to be safe. If tidying ever fails, you still get the word-for-word text.

**Technique library:** the built-in list lives in `Backend/app/techniques_seed.py` and is added to the `technique` table when the API starts. Add a line there to add a technique. Techniques users type in themselves are saved to their account only. The app keeps a copy (`Mobile/src/data/techniques.ts`) for the first time it's used offline, so keep the two in step.

| Endpoint | What it does |
|---|---|
| `GET /sessions` | Your sessions, newest first, with techniques and the subs tally |
| `PUT /sessions/{id}` | Log or edit a session (the app makes the id, so offline retries never double up) |
| `DELETE /sessions/{id}` | Delete one of your sessions |
| `GET /techniques` | The technique library plus your own techniques |
| `GET /voice/status` | Whether voice notes are set up, and the longest recording allowed |
| `POST /voice/notes` | A recording in, clear written notes out (`{audio_base64, field}`) |
| `POST /voice/session` | Voice dump: a recording in, the Quick Log fields out (`{audio_base64, focus, partners, today}`) |

## Light and dark mode

**Your data:** **Menu → Settings → Your data** exports everything: **CSV** (one row per session, opens in Excel / Google Sheets) or **JSON** (everything, for backups). On a phone it opens the share sheet (save to Drive / Files or email it); in a browser it downloads.

**Menu → Settings → Appearance** has three choices: **Light**, **Dark** (the default) and **System**, which
follows the phone's own setting and switches automatically. The choice is saved on the device
(AsyncStorage), so it also applies to the login screen and works offline.

When building a screen, don't hard-code colours. Take them from the current theme:

```tsx
import { makeStyles, useTheme } from '../ThemeContext';

function MyScreen() {
  const styles = useStyles();        // styles for the current theme
  const { colors } = useTheme();     // only if you need a colour in the JSX itself
  return <Text style={styles.title}>Hi</Text>;
}

const useStyles = makeStyles((colors) => ({
  title: { color: colors.text, fontSize: 20 },
}));
```

New colours go in **both** palettes in `src/theme.ts` (`darkColors` and `lightColors`).

## Working offline

The app keeps working without signal (e.g. at the gym):

- **Opening the app**: your profile is remembered on the phone, so it opens straight to the home screen.
- **Saving changes**: anything sent with `sendOrQueue()` (from `src/offline/OfflineSync.tsx`) is tried
  straight away. If the phone is offline, it's saved in an **outbox** on the phone (AsyncStorage) instead.
  Profile edits, logged sessions and the admin **Tasks** list use it.
- **Uploading later**: the outbox uploads automatically, in order (changes made while an upload is running join the same run), when the app opens, comes back to the
  foreground, or every 20 seconds while something is waiting. There's also an **Upload now** button.
- **No duplicates**: each queued change has a random ID sent as the `Idempotency-Key` header. If a retry
  repeats something the server already did, the server replays its original answer instead of doing it twice
  (`Backend/app/idempotency.py`, table `idempotency_record`, kept 7 days).
- **Status**: a small pill on the home screen shows "Offline · 2 changes saved on this phone", "Uploading…",
  "All changes uploaded", or "1 change couldn't be saved" (tap it for details, Try again or Discard).
- **Needs a connection**: logging in, changing your username/email (the server must check they're free),
  and profile pictures.

To use it for something new:

```ts
const { sendOrQueue } = useOfflineSync();
const result = await sendOrQueue<Session>({
  path: '/sessions', method: 'POST', body: {...}, label: 'Session at Gracie Barra',
});
if (result.status === 'queued') { /* saved on the phone, will upload later */ }
```

Include the date/time the user did the thing in the body (not when it uploads), since it may upload hours later.

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
| Voice note says it isn't switched on | Add `OPENAI_API_KEY` to `Backend/.env` (no spaces around `=`, file named `.env` not `.env.txt`) and restart the API |
| Voice note says the key was refused | The key is wrong, deleted, or the account has no credit. Check Billing on the OpenAI site |
| `column ... does not exist` | A model gained a field your existing table doesn't have. See "Adding a field to a model" above |
| `Port 8081 is being used` | Another Expo server is still running. Press `Y` to use another port, or close the other terminal |
| Phone can't connect but the browser can | Allow Python through Windows Firewall on private networks, and make sure the phone is on the same Wi-Fi |

## Roadmap

- [x] Home screen: weekly training widget (tap a day to see its sessions)
- [x] Log training sessions from the app (works offline)
- [x] Stats → Fitness: water and weight tracking
- [ ] Stats → BJJ progress (sub tally: subs vs taps per week, techniques over time, Gi vs No-Gi, most common subs)
- [x] Voice notes for what went right / wrong (OpenAI)
- [x] Quick Log with voice dump; one-focus practice loop; partner tags; rule-based insights; JSON / CSV export
- [ ] Rounds within a session (per-round partner, result and energy, for fatigue-by-round insights)
- [x] Lock `/users` endpoints to the logged-in user / admins
- [x] Lock `/sessions` endpoints to the logged-in user
- [ ] Belt and stripe progress tracking
- [ ] Real email sending for password reset
- [ ] Alembic database migrations
- [ ] `requirements.txt` for the backend
