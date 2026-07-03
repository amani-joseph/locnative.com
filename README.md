# locnative.com

This project is a TanStack Start monorepo for `locnative.com`, with a separate ORPC server, Better Auth, Drizzle, and Neon Postgres.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Start** - SSR framework with TanStack Router
- **ORPC + Hono** - Typed RPC layer and standalone server app
- **Drizzle + Neon Postgres** - Database schema, queries, and auth storage
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Authentication** - Better Auth
- **Biome** - Linting and formatting
- **Turborepo** - Optimized monorepo build system

## Getting Started

Use Node.js 20.19 or newer, then install the dependencies:

```bash
pnpm install
```

## Environment Setup

Create the environment files expected by the web app and the ORPC server.

### Required values

- `DATABASE_URL` - Neon Postgres connection string
- `BETTER_AUTH_SECRET` - Better Auth signing secret
- `BETTER_AUTH_URL` - Public auth base URL for the server, for example `http://localhost:3003`
- `VITE_SERVER_URL` - ORPC server base URL used by the web app, for example `http://localhost:3003`
- Any OAuth provider secrets you intend to use

### Local development ports

- Web app: `http://localhost:3001`
- ORPC server: `http://localhost:3003`

### Better Auth Setup

- Ensure the Better Auth variables are available to `apps/server` and `apps/web`
- Point the web app at the ORPC server with `VITE_SERVER_URL`
- Configure any Better Auth provider secrets before running auth flows

Then, run the development server:

```bash
pnpm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@locnative/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Git Hooks and Formatting

- Format and lint fix: `pnpm run check`

## Project Structure

```
locnative.com/
├── apps/
│   ├── web/         # Frontend application (React + TanStack Start)
│   └── server/      # ORPC + Better Auth server
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # Shared ORPC contract and procedures
│   ├── database/    # Drizzle schema, migrations, and DB helpers
│   └── env/         # Shared environment parsing
```

## Available Scripts

- `pnpm run dev`: Start all applications in development mode
- `pnpm run build`: Build all applications
- `pnpm run dev:web`: Start only the web application
- `pnpm run dev:server`: Start only the ORPC server
- `pnpm run check-types`: Check TypeScript types across all apps
- `pnpm run check`: Run Biome formatting and linting
