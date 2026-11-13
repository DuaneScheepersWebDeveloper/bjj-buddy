# BJJ Buddy: architecture

How the app is put together and why. For setup and day-to-day use, see [README.md](README.md).

## The idea

BJJ Buddy is built around a **deliberate-practice loop**:

```
pick ONE focus ──► train ──► quick log (did I work on it? what worked / failed? energy? partners?
      ▲                       one thing to change next time)
      │                                   │
      └── review after N sessions ◄───────┘   (got it / keep going / park it)
```

Everything else (the dashboard, insights, feedback after logging) exists to make that loop
fast and to show it's working. Logging has to be quicker than not logging, so the main
log is one screen with smart defaults, and you can say it instead of typing.

## Stack

| Part | What | Why |
|---|---|---|
| App | Expo SDK 58 / React Native, TypeScript, runs in **Expo Go** | No native build needed to try changes on a phone |
| Navigation | One `HomeScreen` that swaps sections (`navigation/menuItems.ts`) | Simple; Expo Router can replace it later |
| Storage on the phone | **AsyncStorage** | Works in Expo Go. MMKV is faster but needs a development build; the stores are small (hundreds of sessions), so AsyncStorage is fine. Swapping later only touches the contexts |
| Server | FastAPI + SQLModel + Postgres (Docker) | |
| AI | OpenAI, server side only, optional | Voice notes and the voice dump. The key never reaches the phone. Everything else works without it |

## Offline first

Every change is saved on the phone first and uploaded when there's signal.

- **Outbox** (`Mobile/src/offline/`): a queue of changes kept in AsyncStorage. Uploaded in order,
  each with an `Idempotency-Key`, so a retry is never applied twice (`Backend/app/idempotency.py`).
  Uploads work on the live queue, so changes made mid-upload join the same run.
- **The phone makes the ids** (UUIDs) for sessions and focuses. A session logged offline can be
  edited or deleted before it ever reaches the server, and `PUT /{id}` (create or replace) makes
  every retry harmless.
- **Each store** (`SessionsContext`, `FocusContext`, `useFitness`) keeps the server's copy in
  AsyncStorage and lays this phone's waiting changes over it (`applyPending`), so the screen
  always shows what you did, uploaded or not.

## Data model

```
user ─┬─< training_session ──< session_entry >── technique
      │        │  focus_id (no FK, see below)
      │        │  energy 1-5, adjustment, partners (JSON)
      ├─< focus          one active per user (ended_on IS NULL)
      ├─< session_note   (coach → a student's session)
      ├─< weight_entry / water_log
      └─< technique      (the user's own; built-ins have user_id NULL)
```

**training_session**: when, where, how long, Gi/No-Gi, class/open mat/private/competition,
notes (`went_right`, `went_wrong`, `to_improve`), plus the reflection:

- `focus_id`: the focus you worked on in this session (empty if you didn't). No foreign key on
  purpose: with offline uploads, the session can arrive before or after its focus.
- `energy`: 1 (gassed) to 5 (sharp).
- `adjustment`: the ONE thing to change next time. Shown on the focus card and listed on the
  Focus page as the running reflection.
- `partners`: JSON, e.g. `[{"name": "Sam", "traits": ["bigger"], "outcome": "tapped_by"}]`.
  Names are optional. Traits: bigger, smaller, stronger, faster, flexible, higher/same/lower belt.
  JSON so new details can be added without a migration.

**session_entry**: a technique in a session, `hit` (you did it) or `conceded` (done to you),
with a count. Name, category and position are copied from the library, so old logs read the
same if the library changes.

**focus**: title, why, `target_sessions` (when to review), `started_on`, `ended_on` (empty =
active), `outcome` (got_it / keep_going / parked) and a reflection. A partial unique index
(`ix_focus_one_active`) guarantees one active focus; `PUT /focus/{id}` ends any other active one.

**Room to grow:** the next natural addition is **rounds** within a session (partner, result and
energy per round), which would allow fatigue-by-round insights. That would be a new
`session_round` table linked to `training_session`; nothing existing needs to change.

Schema changes: `create_all` makes new tables; new columns go in `_ADD_MISSING_COLUMNS` in
`Backend/app/database.py` (until Alembic).

## Key flows

**Quick log** (`screens/QuickLogScreen.tsx`)
1. Defaults from your last session; "Worked on my focus" pre-ticked.
2. Optional **voice dump**: record, `POST /voice/session` → speech to text, then a model returns
   strict JSON, which the server cleans (`clean_extraction`: allowed values only, technique names
   snapped to the library). The app merges it into the form without wiping what you entered.
   If extraction fails you still get the words, in "What worked".
3. Save → outbox → feedback (`feedbackFor`).

**Insights** (`insights/insights.ts`): pure functions of `(sessions, today)`. No AI and no
server, so they're instant, offline and testable. Each rule has a minimum amount of data
before it says anything and a priority; the dashboard shows the top two. To add one, write a
function returning `Insight | null` and add it to `insights()`.

**Focus progress** (`focusProgress`): reps = sessions with that `focus_id`. Status `review` at the
target, `stale` after 10 days without a rep, with one suggested line for the card.

## Design choices

- **One focus, not a list of goals.** Splitting attention is the most common reason practice
  goals fade.
- **Tap first, type optional.** Every reflection field is chips or a short line.
- **Subtle feedback.** Progress bars, rep counts and a few lines after saving. Streaks count
  weeks with a session, so a rest day never breaks one.
- **Dark mode by default**, with light and system modes. Colours come from `theme.ts` via
  `makeStyles` / `useTheme`; never hard-code them.
- **Icons are SVG** stick figures (`sessions/techniqueIcons.ts`), drawn in code so they follow the theme.

## Exporting

Settings → Your data: CSV (one row per session) or JSON (everything, with `format_version`).
`lib/exportData.ts`. Downloads in a browser, share sheet on a phone.
