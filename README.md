# TV Tracker

A TV Time–style show tracker built with Expo (SDK 58), Expo Router tabs, and TypeScript.

## Run

```bash
npm install
npx expo start        # press a (Android), i (iOS), w (web) — or scan the QR code with Expo Go
```

## Data sources (free, no API keys)

- **[TVmaze API](https://www.tvmaze.com/api)**: shows, seasons, episodes, cast/crew, and daily broadcast and streaming schedules. It's updated continuously, so new releases and premieres show up automatically. Data is CC BY-SA, and the app credits TVmaze on the Profile tab.
- **[Wikipedia REST API](https://en.wikipedia.org/api/rest_v1/)**: actor and crew biographies.

## Features

| Tab | What it does |
| --- | --- |
| **Shows** | Watch list: *Watch next* (with one-tap "mark watched"), *Haven't started*, *Up to date* |
| **Discover** | Search shows & people, Trending now, Coming soon / Just premiered, Streaming today, On TV tonight |
| **Calendar** | Your shows' episodes as one timeline that opens at today (past episodes above, upcoming below, watched ones dimmed, floating *Today* button to jump back), plus a 9-day TV guide (US/UK/CA/AU TV + streaming) |
| **Profile** | TV time watched (months/days/hours), episode and show stats, progress per show, link to *Account, sync & backup* |

Detail screens: **Show** (summary, seasons/episodes with watch toggles, cast & crew, info, links), **Episode** (synopsis, air info, guest stars, director/writer, prev/next), **Person** (bio, birthday/age, filmography).

Long-press an episode's checkmark to mark every episode up to it as watched.
If you mark an episode or a whole season as watched while earlier aired episodes are still unwatched, you're asked whether to mark them all, just this one/season, or cancel. Likewise, unmarking an episode or season while later episodes are still marked watched asks whether to unmark those too.

Trailers: TVmaze has no video data, so the YouTube buttons on show pages ("Watch trailer"), season rows and episode pages ("Find episode promo") open a YouTube search for the trailer/promo (the YouTube app on a phone, if installed).

Time zones: all dates and times are shown in the device's time zone, so an episode airing 9 PM in New York appears on the next day for viewers in Europe/Asia. The TV guide and "On TV tonight" also group shows by your local day.

## Moving your data between devices

Your followed shows and watched episodes are stored on the device. Go to **Profile → Account, sync & backup** to move them:

- **Backup file (no account):** *Save backup file* downloads (web) or shares (phone) a `tvtracker-backup-YYYY-MM-DD.json` file. Use *Restore from backup* on the other device to load it. The backup is combined with what's already there, so nothing is lost.
- **Cloud sync (Supabase account):** sign in with the same email on each device. Changes sync automatically: a couple of seconds after each change, when the app opens or comes back to the foreground, and every 2 minutes. Unwatching an episode or removing a show also syncs.

### One-time Supabase setup (free tier)

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, paste and run [supabase/schema.sql](supabase/schema.sql). It creates the `tracker_state` table with row-level security, so each user can only read and write their own data.
3. Copy `.env.example` to `.env.local`. Fill in the **Project URL** and the **Publishable key** (`sb_publishable_...`). Both are under the **Connect** button at the top of the dashboard, or under **Project Settings → API Keys** (the URL is also under **Project Settings → Data API**). Never use a *Secret* key in the app. The legacy `anon` key also works, set as `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
4. Restart `npx expo start`.

New accounts must confirm their email by default. You can turn this off under **Authentication → Sign In / Providers → Email → Confirm email**.

### Episode push notifications (iOS and Android)

Episode alerts are opt-in under **Profile → Account, sync & backup → Episode notifications**. They include one action button and group new releases into a catch-up alert, limited to three sends per device per local day. Opening the app clears that device's pending group. iOS can report an explicit dismissal when the OS delivers its dismissal callback; Expo does not expose a reliable Android swipe-away callback, so on Android the group may remain active until the app is opened. Android can update an active notification; iOS groups/collapses updates where the OS allows, but may show more than one item for an already-delivered alert.

Push delivery while the app is closed needs the Supabase Edge Functions and a scheduled job; the static Render site alone cannot send pushes.

1. In Supabase **Authentication → Providers**, enable **Anonymous Sign-Ins**. This lets people who do not create an account receive notifications; their device subscription remains tied to that anonymous session.
2. Run the updated [supabase/schema.sql](supabase/schema.sql) in the Supabase SQL Editor.
3. Link this folder to the Supabase project with the Supabase CLI, then deploy `notification-device` and `dispatch-notifications`:

   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase functions deploy notification-device
   supabase functions deploy dispatch-notifications
   ```

4. In the Expo account, initialize an EAS project for this app (`npx eas-cli@latest init`) and configure iOS/Android push credentials in EAS. The generated `extra.eas.projectId` is used to request the device's Expo Push Token. For cross-platform testing, install an EAS-built app on a physical device; Android remote push requires a development/production build rather than Expo Go. Web push is not supported by this feature.
5. In Supabase, enable the `pg_cron`, `pg_net`, and Vault extensions. In **Database → Vault**, save two secrets named `tv_tracker_project_url` (the project URL) and `tv_tracker_service_role_key` (the service-role key). Never put the service-role key in the app or source control. Then schedule the dispatcher every 15 minutes:

   ```sql
   select cron.schedule(
     'tv-tracker-episode-notifications',
     '*/15 * * * *',
     $$select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'tv_tracker_project_url')
         || '/functions/v1/dispatch-notifications',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || (
           select decrypted_secret from vault.decrypted_secrets where name = 'tv_tracker_service_role_key'
         )
       ),
       body := '{}'::jsonb
     );$$
   );
   ```

   Run the SQL only once. To change the schedule, unschedule the existing job before adding another. Push permissions are requested only after the user opts in; the notification worker checks TVmaze schedules and sends alerts via Expo Push Service.

## Deploy the web app on Render

[render.yaml](render.yaml) deploys the web version as a free static site (`npx expo export --platform web` → `dist/`, with every path rewritten to `index.html`).

1. Push this folder to a GitHub/GitLab repo (`.env.local` is git-ignored and stays private).
2. Render dashboard → **New → Blueprint** → pick the repo → enter `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` → **Apply**.
3. In Supabase → **Authentication → URL Configuration**, set **Site URL** to your Render URL (e.g. `https://tv-tracker.onrender.com`) so confirmation emails link back to the app.

Every push redeploys. The `EXPO_PUBLIC_*` values are baked in at build time, so after changing them use **Manual Deploy → Clear build cache & deploy**.

The web home-screen icon is a black square with red **TV** above **Tracker**, both the same width. The manifest and Apple touch icon are configured in `public/`. After deploying an icon change, remove the old home-screen shortcut and add the site again; phones can cache the old icon. This adds home-screen branding, not offline support.

## Structure

```
app/              Expo Router screens: (tabs)/, show/[id], episode/[id], person/[id]
components/       Shared UI (posters, rows, buttons, segmented control)
lib/tvmaze.ts     Typed TVmaze client with caching, a concurrency limit, and 429 retry
lib/wikipedia.ts  Biography lookup
lib/useMyShows.ts Per-show progress (next episode, aired/watched counts)
store/tracker.tsx Followed shows + watched episodes, persisted with AsyncStorage
store/sync.tsx    Supabase sign-in + automatic cloud sync
lib/trackerData.ts Data format + conflict-free merge used by sync and restore
lib/backup.ts     Backup file export/import
```
