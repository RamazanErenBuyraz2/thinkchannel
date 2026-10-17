# Think Channel

React, Vite, and Supabase. The browser reads and writes application data through the Supabase Data API with row-level security (RLS); Supabase Auth handles password sign-up, sign-in, and sessions. This app does not implement email-code delivery or require a local email API.

## Configure

Requirements: Node.js 20.19+ (or 22.12+) and a Supabase project.

1. Copy `.env.example` to `.env`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the Supabase project's API settings. The anon key is public; access to application tables is restricted by RLS.
3. For a new Supabase project only, review and apply `server/setup.sql` using the Supabase SQL Editor. The script is transaction-protected and stops before making changes if it detects an existing application database. For an existing project, apply the additive `server/upgrade.sql` instead; do not use `setup.sql` to update an existing installation. The application does not run schema changes automatically.
5. The admin **TV Shows** menu manages Cartoons, Animes, Seasons, and Episodes. Cartoon/anime entries are classified with `contents.content_type`; seasons, episodes, and episode source URLs are stored in the catalog expansion tables.
6. Install dependencies and start the app:

   ```sh
   npm install
   npm run dev
   ```

### Standalone Windows admin application

The admin desktop app is a separate Electron application with its own React renderer and Supabase login. It opens a native desktop window and does not load, embed, or preview the website. It provides dashboard metrics, catalog and TV-show CRUD, FAQ/slider/collection management, age and quality icon definitions, episode media records, the media library, and Backblaze/Cloudflare storage settings.

In the web admin, use **Simgeler** to upload and manage age-rating and quality badge artwork. Subtitle cue editing opens as a dedicated movie subtitle page; saving uploads the edited SRT to Backblaze and updates the movie's subtitle record.

1. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` before building. These are the same public Supabase settings used by the website.
2. Run `npm run desktop:dev` to build and open the standalone desktop application.
3. Run `npm run desktop:package` to build the Windows NSIS installer. The installer is written to `release/installer`.
4. To use Media Library and Storage Settings in the installed app, add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `B2_SETTINGS_ENCRYPTION_KEY` to `.env` in the app's Electron user-data directory (shown by `app.getPath("userData")`, normally under `%APPDATA%/think-channel-admin`). Keep the service-role and encryption keys out of the renderer and installer. The desktop app runs only the existing storage API handler locally; the admin storage settings migration must already be installed.

The development app runs on Vite and communicates directly with Supabase. Password sign-up and sign-in require no Express email API, Resend key, service-role key, or `AUTH_SECRET`. If email confirmation is enabled in Supabase Auth, its configured native confirmation flow applies; the app has no custom email-code flow.

Application pages use the `/tr-tr/` URL prefix. Requests to the site root open `/tr-tr/home`, and other unprefixed page URLs permanently redirect to their localized path. Static assets and API routes are not localized.

The production SSR server can be started with `npm run start:api` after building. Rendering public pages uses the Supabase URL and anon key. The admin storage settings API additionally requires its server-only Supabase service-role key and encryption key.

### Backblaze B2 and optional Cloudflare CDN settings

Local storage is not an available media-storage provider. Backblaze B2 is required; the bucket can remain private. Site media is streamed through the same-origin `/media/` endpoint, so B2 credentials and B2 download-authorization tokens stay on the server. The endpoint allows only media referenced by published site records, or an exact-object signed URL issued to an authenticated admin. A signed URL is a bearer link to that one file; treat it as public once attached to published content. HLS manifests are rewritten so each playlist and segment remains protected. Cloudflare CDN is optional and is not required for media delivery. Production hosting must route `/media/` requests to the API server. Save stores entered values and leaves blank fields unchanged. **Test Connections** verifies B2, and verifies Cloudflare only when Cloudflare settings have been entered:

1. Apply `server/setup.sql` in the Supabase SQL Editor. The encrypted settings table is not readable by `anon` or `authenticated` roles.
2. Add the Supabase service-role key to the server environment as `SUPABASE_SERVICE_ROLE_KEY`. Never use a `VITE_` prefix for this key.
3. Add `B2_SETTINGS_ENCRYPTION_KEY` as a base64-encoded, randomly generated 32-byte key. For example, run `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` and keep its output only in the server's `.env` or secret manager. Back up this key securely; settings cannot be decrypted without it.
4. Restart the Vite server for development, or the API server in production. Enter the B2 bucket, Application Key ID and Application Key, S3 endpoint and region. The B2 key needs permission to list, read, write, and authorize downloads for files in the configured bucket. To use a CDN for other integrations, also enter the Cloudflare Zone ID, API token (with Zone Read permission), and HTTPS CDN URL.
5. Use **Test Connections** to verify B2, and Cloudflare if configured. The B2 Application Key and Cloudflare API token are AES-256-GCM encrypted server-side; neither secret is returned to or persisted by the browser.
6. In **Media Library**, opening the bucket root removes legacy `.bzEmpty` markers previously created under `app/` and no longer creates default folders. Any actual files under `app/` are preserved. The library supports creating folders and uploading multiple files into the open folder. Each file can be up to 100 MB; the Backblaze key needs permission to list and write files in the configured bucket. Image previews use a short-lived, file-scoped download authorization, so the key must also have the `shareFiles` capability.

### Catalog artwork and episode video uploads

New artwork is uploaded to Backblaze from the admin media picker; the picker can also select existing Backblaze files. Existing direct B2 URLs are routed through `/media/` by the website, and remain inaccessible through B2's native download URL while the bucket is private. Existing database values and local assets are not migrated or deleted. Catalog artwork has distinct roles: `poster/` is for vertical cards, `thumbnail/` is the clean (no-logo) image for sliders and detail backgrounds, `logo/` stores the title logo, `thumbnail-logo/` is for horizontal cards and continue-watching rows, and `banner-video/` stores the optional moving background video. Catalog paths are rooted at `archive/movies/{slug}/`, `archive/animes/{slug}/`, or `archive/cartoons/{slug}/`. Season and episode artwork is nested under `seasons/season-{number}/`; episode HLS output is stored under `episodes/episode-{number}/hls/`. Brand assets use `images/logos/` and `images/favicons/`, and icon assets use `storage/images/icons/{age|quality|player|others}/`.

Movie and episode video uploads accept MP4 and send it in 8 MiB chunks to the authenticated API server. FFmpeg and FFprobe must be installed on that server (or configured with the server-only `FFMPEG_PATH` and `FFPROBE_PATH` environment variables). HLS conversion automatically creates every supported rendition from the source resolution down to 144p, adds detected audio streams as selectable HLS audio groups, extracts supported embedded text subtitles as WebVTT tracks, and uploads the resulting `master.m3u8` and sidecar tracks. Video and audio HLS segments target 2 seconds and video keyframes are aligned to the segment interval across renditions, allowing responsive seamless quality changes at segment boundaries. Compared with longer segments, this creates more Backblaze objects and requests. Existing encodes keep their original segment duration until re-encoded. Before encoding, FFmpeg probes NVIDIA NVENC, Intel Quick Sync, and AMD AMF on the API host, uses the first hardware encoder that completes a real test encode, and falls back to CPU `libx264` when none is usable. NVIDIA uses the fast NVENC preset and, when the source format is supported, NVDEC hardware decoding and CUDA scaling; up to three hardware-encoded renditions are processed in parallel to reduce total encoding time. CPU `libx264` encoding remains single-worker to avoid multiplying CPU load. A web browser cannot expose the visitor's local GPU to server-side FFmpeg; in the standalone desktop setup the API host is local. Backblaze output uploads are bounded to eight concurrent workers, each reuses its upload URL, and transient 429/5xx responses are retried with `Retry-After` or exponential backoff, rather than opening unbounded requests or hammering the service. Selecting an MP4 in the video upload modal starts the upload and HLS workflow immediately; the modal shows only the current phase, overall percentage, and elapsed time, with cancellation available there. Overall progress includes the initial MP4 transfer and maps encoding/output progress into the remaining range; output transfer progress is weighted by completed bytes rather than file count. Cancellation stops processing and hides only the Backblaze objects created by that upload job while preserving unrelated files in the same archive folder. External subtitle selection uses an upload dialog; subtitle uploads require a language and a local SRT, VTT, ASS, or SSA file. Extracted subtitle and audio metadata is stored with the movie or episode so it appears in playback and administration. The conversion runs on the API host and requires enough temporary disk space for the uploaded MP4 and generated HLS files.

For an existing database, apply `server/upgrade.sql` once in the Supabase SQL Editor. It combines the additive database upgrades (artwork columns, movie catalog page keys, audio tracks, live-TV stream fields, featured character avatars, per-character avatar availability, episode quality icons, and admin notifications), including the moving-banner and logo-thumbnail fields. It is safe to run again and does not truncate, drop, or delete existing rows. For a fresh database, run `server/setup.sql` first, then `server/upgrade.sql`. Never re-run `server/setup.sql` against a populated database whose data must be kept.

The admin **Yedekleme** page creates compressed JSON snapshots of the application tables and Supabase Auth account metadata, stores them under `database-backups/` in the configured private Backblaze bucket, and lists previous archives for download. Video and image objects are not included; Auth passwords and tokens are not exportable and are not included. The export contains row data rather than SQL DDL and is intended as a data archive, not an in-panel restore operation. The API server needs the Supabase service-role key and configured Backblaze access; the compressed archive upload limit is 512 MB. Applying `server/upgrade.sql` enables statement-level admin change notifications across public tables. Catalog media paths continue to use the saved content slug when a title changes, keeping existing object URLs and uploads in the same storage prefix.

Catalog, FAQ, legal, platform, and live-TV tables remain in the database. The development SSR renderer fails visibly when Supabase cannot be reached instead of displaying bundled placeholder copy. `public.users` has one account row per Supabase Auth account and stores the account email, first name, last name, and member/admin role; passwords remain exclusively in Supabase Auth. `public.profiles` has multiple viewing profiles per account. Profile watchlists, watch history, homepage preferences, PIN credentials, and transfer requests are stored separately and linked to a viewing profile. RLS restricts private profile data to its owning account. New accounts start with no viewing profiles; a signed-in user creates their first profile from `/tr-tr/select-profile`.

The admin Settings page manages Backblaze B2 and Cloudflare CDN credentials, theme colors, site name and description, desktop/mobile/footer logos, size-specific favicons, SEO metadata, FAQ entries, and the ordered sections of the privacy policy and terms of use. Newly uploaded brand images are stored in Backblaze; the `site_settings` row stores their URLs.

## Authentication

- Password sign-up uses Supabase Auth and stores profile and consent metadata through the Auth user trigger.
- Login and sign-up both check `public.account_email_exists`: an unknown login address opens sign-up with the email filled, while an existing sign-up address opens login with the email filled. Continuing registration with an unknown address leaves the other details empty. This intentionally reveals whether an email address has an account.
- Opening sign-up from the landing page starts with a clean form. The active sign-up step and non-password fields persist in the current browser tab across refreshes; passwords are never stored in browser storage, and email addresses are not put in page URLs.
- Successful registration redirects to `/tr-tr/select-profile` if Supabase immediately establishes a session; when email confirmation is required, the user goes to login and can choose a profile after signing in. The Auth trigger that stores the account in `public.users` is installed by `server/setup.sql`.
- Signed-in users are redirected away from login and registration. The profile picker is available at `/tr-tr/select-profile`, profile management at `/tr-tr/edit-profiles`, and an individual profile at `/tr-tr/edit-profile/{profileId}`. Creating or editing a profile uses the same form for its name, avatar, Junior Mode, and optional PIN lock.
- Password sign-in and session persistence use Supabase Auth in the browser.
- Email confirmation, if enabled, is controlled by the Supabase Auth project settings.
- No one-time-code forms, resend controls, custom email API routes, or Resend integration are included.

## Content and collections

No sample titles, FAQ entries, or legal-document text are seeded. `contents` stores content and its logo/short description; `categories` and `content_categories` classify catalog items. Seasons and episodes are attached to content, and each episode can have video-source, subtitle, and audio assets. Age ratings and quality badges are definitions linked directly to each content entry through `content_age_icons` and `content_quality_icons`. `platforms` and `platform_contents` independently associate catalog content with streaming platforms. A live-TV platform can own channels, each with scheduled content and optional episodes in `tv_schedule`. A `collections` row can be manually curated with `collection_items`, or set to automatic selection using a category, optional genre filters, and an item limit; `collection_content_items` resolves both modes for display. `page_key` and publication state control where a collection can appear. Public users can read only published content; admin changes are protected by RLS.

## Validation

Run `npm run typecheck` and `npm run build`.
