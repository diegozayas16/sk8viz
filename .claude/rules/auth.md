---
paths:
  - "server/auth.ts"
  - "server/analyzeHandler.ts"
  - "server/uploadHandler.ts"
  - "server/config.ts"
  - "src/services/supabase.ts"
  - "src/hooks/useAuth.ts"
  - "src/components/AuthPanel.tsx"
---

# Accounts (Supabase Auth)

- Sign-in: Google OAuth, or email + password with "Confirm email" **off** (no
  email service yet, so emails are unverified and there is no password reset).
- Browser sends the Supabase access token as `Authorization: Bearer` to
  `/api/upload` and `/api/analyze`. The server verifies it with
  `auth.getClaims(token)` in `server/auth.ts` (JWKS, cached) and uses `sub`
  as the user ID. Never trust an unverified token or a user ID from the body.
- Auth is checked before the limiter or any storage is touched.
- Same two vars on both sides: `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY` (public by design). The secret/service-role
  key is not used. On Vercel, live analysis is off unless both are set.
- Supabase Auth → URL Configuration must list localhost:5173, the production
  URL, and the preview pattern, or OAuth redirects fail.
