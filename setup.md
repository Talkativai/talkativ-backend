# Integrations Status & Setup Guide

## Current Backend Status (`env.ts`)

### ✅ Implemented (Environment variables exist)
- **Stripe**: Fully setup (`STRIPE_SECRET_KEY`, `STRIPE_CONNECT_CLIENT_ID`, etc.)
- **Square**: Setup (`SQUARE_CLIENT_ID`, `SQUARE_CLIENT_SECRET`)
- **Clover**: Setup (`CLOVER_APP_ID`, `CLOVER_APP_SECRET`)
- **SumUp**: Setup (`SUMUP_CLIENT_ID`, `SUMUP_CLIENT_SECRET`)
- **Zettle**: Setup (`ZETTLE_CLIENT_ID`, `ZETTLE_CLIENT_SECRET`)
- **SpotOn**: Partially setup (`SPOTON_WEBHOOK_SECRET` exists, but missing standard OAuth/API keys)

### ❌ Not Implemented (Missing from `.env` / `env.ts`)
- **resOS** (Reservations)
- **ResDiary** (Reservations)
- **OpenTable** (Reservations)
- **Collins** (Reservations)

---

## Todo List

- [ ] Register as a partner/developer with **resOS**
- [ ] Add `RESOS_CLIENT_ID` and `RESOS_CLIENT_SECRET` to `env.ts`
- [ ] Connect with **ResDiary** partnerships team to get API keys
- [ ] Add `RESDIARY_API_KEY` to `env.ts`
- [ ] Apply for **OpenTable** developer partner program
- [ ] Add `OPENTABLE_CLIENT_ID` and `OPENTABLE_CLIENT_SECRET` to `env.ts`
- [ ] Contact **Collins (DesignMyNight)** for API access documentation
- [ ] Add `COLLINS_API_KEY` to `env.ts`
- [ ] Verify **SpotOn** integration (only webhook secret exists, may need `SPOTON_API_KEY`)

---

## Setup Guide: How to get missing credentials

### 1. resOS (Reservations)
resOS has an open API for integrations, focused on restaurant bookings.
1. **How to get it:** Create a resOS account or reach out via their developer portal (https://resos.com/api/).
2. **Steps:**
   - Log in to your resOS admin dashboard.
   - Go to **Settings > Integrations > API**.
   - Create a new API authentication token. If you need a platform-wide OAuth setup for one-tap connect (which is ideal), you must email their support (support@resos.com) asking for an "OAuth Client ID" for your SaaS product.

### 2. ResDiary
ResDiary uses a secure locked-down API. They do not have a public self-serve developer portal.
1. **How to get it:** You must apply for a partnership.
2. **Steps:**
   - Go to https://sales.resdiary.com/partner-with-resdiary/
   - Fill out the partner integration request. 
   - Once approved, they will provide a specific `Channel Code` and `API Key/OAuth Credentials` for your app to authenticate across their thousands of UK restaurants. 

### 3. OpenTable
OpenTable is extremely strict about who can pull their inventory or push reservations.
1. **How to get it:** Apply to their Affiliate/Partner program.
2. **Steps:**
   - Visit https://restaurant.opentable.com/partner-network/
   - Submit an inquiry about integrating "Talkativ Voice AI" with OpenTable.
   - They will give you sandbox access to their Partner API once approved. They use OAuth2, so you'll receive a `Client ID` and `Client Secret`.

### 4. Collins (DesignMyNight)
Collins is the premier UK bookings system for pubs and big venues.
1. **How to get it:** Contact Access Group (who owns DesignMyNight).
2. **Steps:**
   - They handle integrations directly via sales/support. 
   - Email support@designmynight.com or use the Access Group partner portal.
   - You will request a REST API key and webhook access. Collins relies heavily on webhooks so you'll also need to provide them with a webhook URL from your backend.

### 5. SpotOn (POS)
You currently only have `SPOTON_WEBHOOK_SECRET` in your `.env`.
1. **How to get it:** SpotOn requires a Master Developer account to access merchant data via OAuth.
2. **Steps:**
   - Go to https://developer.spoton.com/
   - Register a developer account to get a standard `SPOTON_CLIENT_ID` and `SPOTON_CLIENT_SECRET` (if they support typical OAuth) or a Master API key so the restaurants can connect with a single tap.

---

## Setup Guide: POS OAuth Platforms

If you are filling in your `.env` for the core POS networks (Square, Clover, SumUp), here is how to generate those API keys. 

### 6. Square
1. **How to get it:** Use the Square Developer Dashboard.
2. **Steps:**
   - Go to https://developer.squareup.com/apps and log in.
   - Click the **"+" (New Application)** button. Give it a name (e.g., "Talkativ").
   - Click "Save".
   - In your app dashboard, go to the **OAuth** tab on the left.
   - Under Production (and Sandbox), you will see your **Application ID** (`SQUARE_CLIENT_ID`) and **Application Secret** (`SQUARE_CLIENT_SECRET`).
   - *Crucial:* You must add your backend Redirect URL to the "Redirect URL" section on this page (e.g., `https://api.talkativ.com/integrations/square/callback`) so Square knows where to send the user after they approve access.

### 7. Clover
1. **How to get it:** Clover requires you to register an "App" on their App Market platform.
2. **Steps:**
   - Make a developer account at https://sandbox.dev.clover.com/ (for testing) and https://www.clover.com/developer/ (for production).
   - In your Developer Dashboard, click **Create New App**.
   - Fill in your app name. 
   - Once created, go to **App Settings > App Status**. In the "OAuth Settings" section, add your Redirect URI (Callback URL).
   - Go to **App Settings > Web Configuration**.
   - Here you will find your **App ID** (`CLOVER_APP_ID`) and **App Secret** (`CLOVER_APP_SECRET`).

### 8. SumUp
1. **How to get it:** Through the SumUp Developer Portal.
2. **Steps:**
   - Log in to your SumUp merchant dashboard, then go to the Developer Settings, or visit https://developer.sumup.com/.
   - In the "OAuth Apps" or "Credentials" section, click **Create Application**.
   - Provide the application name and your homepage URL.
   - Click **Create client secret**. They will generate a JSON block or a popup containing your `client_id` (`SUMUP_CLIENT_ID`) and `client_secret` (`SUMUP_CLIENT_SECRET`).
   - You must select the strict scopes needed (like reading the menu/inventory and writing checkouts). Set your "Redirect URL" to capture the OAuth flow.
   - *Note:* SumUp only shows the client secret once, so copy it to your `.env` immediately!
