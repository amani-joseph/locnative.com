---
phase: quick
plan: 260416-qlh
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/env/src/server.ts
  - packages/api/src/auth.ts
  - apps/web/src/components/shadcn-space/blocks/login-03/login.tsx
  - apps/web/src/components/shadcn-space/blocks/register-03/register.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "GitHub OAuth env vars are validated by the env schema so missing values fail fast at startup"
    - "GitHub social provider config in auth.ts uses validated env vars"
    - "Google social sign-in buttons are removed or disabled until Google OAuth is configured"
  artifacts:
    - path: "packages/env/src/server.ts"
      provides: "GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in server env schema"
      contains: "GITHUB_CLIENT_ID"
    - path: "packages/api/src/auth.ts"
      provides: "GitHub social provider config"
      contains: "socialProviders"
  key_links:
    - from: "packages/api/src/auth.ts"
      to: "packages/env/src/server.ts"
      via: "serverEnv.GITHUB_CLIENT_ID and serverEnv.GITHUB_CLIENT_SECRET"
      pattern: "serverEnv\\.GITHUB_CLIENT"
---

<objective>
Audit and fix Better Auth social provider (GitHub OAuth) configuration.

Purpose: GitHub OAuth sign-in is configured in auth.ts but the env vars (GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET) are NOT declared in the server env Zod schema, meaning they bypass validation and will be `undefined` at runtime. Additionally, Google sign-in buttons exist in the UI but Google is not configured as a social provider -- these buttons should be hidden until Google OAuth is set up.

Output: Working GitHub OAuth config with validated env vars; Google buttons removed from UI.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/env/src/server.ts
@packages/api/src/auth.ts
@apps/web/src/components/shadcn-space/blocks/login-03/login.tsx
@apps/web/src/components/shadcn-space/blocks/register-03/register.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add GitHub OAuth env vars to server env schema</name>
  <files>packages/env/src/server.ts</files>
  <action>
    Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to the `server` object in the `createEnv` call in packages/env/src/server.ts:

    ```
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),
    ```

    These must also be added to the `runtimeEnv` spread (they are already included via `...process.env`, so no additional mapping is needed -- but verify this).

    This ensures the app fails fast at startup if GitHub OAuth credentials are missing, rather than silently passing `undefined` to Better Auth.
  </action>
  <verify>
    Run `cd /Users/mac/Developer/projects/locnative.com && pnpm dlx ultracite check packages/env/src/server.ts` to confirm no lint errors.
  </verify>
  <done>GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are declared in the Zod server env schema with min(1) validation.</done>
</task>

<task type="auto">
  <name>Task 2: Remove Google OAuth buttons from login and register forms</name>
  <files>
    apps/web/src/components/shadcn-space/blocks/login-03/login.tsx
    apps/web/src/components/shadcn-space/blocks/register-03/register.tsx
  </files>
  <action>
    In both login.tsx and register.tsx:

    1. Remove the Google sign-in Button (the one with `onClick={() => handleSocialSignIn("google")}` and the Google icon).
    2. Update the `socialProvider` state type from `"google" | "github" | null` to `"github" | null`.
    3. Change the "or sign in with" divider text to "or" (since there is now only one social provider).
    4. Remove `grid-cols-1` from the social buttons container div since there will only be one button (keep it as a simple div or use flex).
    5. Keep the GitHub button exactly as-is.

    Do NOT add Google OAuth config to auth.ts -- Google is not configured and adding non-functional config would break startup.
  </action>
  <verify>
    Run `cd /Users/mac/Developer/projects/locnative.com && pnpm dlx ultracite check apps/web/src/components/shadcn-space/blocks/login-03/login.tsx apps/web/src/components/shadcn-space/blocks/register-03/register.tsx` to confirm no lint errors.
  </verify>
  <done>Google OAuth buttons removed from both login and register forms. Only GitHub sign-in button remains. No references to "google" provider in form state or handlers.</done>
</task>

</tasks>

<verification>
- `packages/env/src/server.ts` contains GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in the Zod schema
- `packages/api/src/auth.ts` still references `serverEnv.GITHUB_CLIENT_ID` and `serverEnv.GITHUB_CLIENT_SECRET` (unchanged, already correct)
- Login and register forms only show GitHub social sign-in button
- No references to Google provider remain in login/register form components
- `pnpm dlx ultracite check` passes on all modified files
</verification>

<success_criteria>
- GitHub OAuth env vars are validated at startup via Zod schema
- Google sign-in buttons are removed from UI (no dead functionality)
- All modified files pass linting
</success_criteria>

<output>
After completion, create `.planning/quick/260416-qlh-check-and-configure-better-auth-github-s/260416-qlh-SUMMARY.md`
</output>
