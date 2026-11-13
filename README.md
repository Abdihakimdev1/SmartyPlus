# Fincore Finance core – Updated UI

This version keeps the existing FinanceHub/Supabase functionality and updates only the requested UI behavior:

- Fixed-height transaction and loan tables with internal vertical scrolling.
- Sticky table headers and horizontal scrolling when columns are wider than the screen.
- Compact profile/greeting card on desktop and mobile (the card no longer stretches down the page).
- Wallet/account cards redesigned to match the compact top-card style, including balance visibility control.
- Logout confirmation: “Are you sure you want to log out?” with English/Somali wording.
- Password visibility eye on login and password-update fields.
- Improved light/dark theme consistency for cards, tables, inputs, text, and surfaces.
- English/Somali UI translations extended across the main interface and dynamic loan/report messages.
- Existing Supabase URL/anon-key configuration and database functionality are preserved.

## Run

Open `index.html` through a local/static web server. Keep the existing Supabase project and credentials unchanged.

Do not expose a Supabase `service_role` key in frontend code.

## Database schema

The app talks to the `finance_hub` schema (set in `script.js` via `db: { schema: "finance_hub" }`). Add `finance_hub` under Supabase Dashboard > Data API settings > Exposed schemas.


## SmartyPlus update — ActivityPlus-inspired UI and wallet transfers

- Updated the green accent palette to a brighter ActivityPlus-inspired green while retaining SmartyPlus dark/light surfaces and page structure.
- Added matching Success, Error, and Warning popups plus a custom logout confirmation.
- Added a Transfer screen to desktop and mobile navigation without changing existing sections.
- Transfers are restricted to currencies shared by both selected wallets: USD→USD, SLSH→SLSH, and ETB→ETB only.
- Cross-currency transfers and transfers to the same wallet are blocked.
- Transfer validates the source balance, updates both wallet balances, and records one `transfer` row in `fh_transactions` for reporting.
- The transfer flow checks Supabase write responses and attempts compensating balance restoration if a later write fails.

No database tables or columns are added by this update. Test transfers in a non-production account first. The existing Supabase project, schema, and client configuration are retained.
