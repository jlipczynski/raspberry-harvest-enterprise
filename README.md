# Raspberry Harvest Enterprise

Monorepo containing two independent projects:

| Project | Description | Port |
|---------|------------|------|
| [raspberry-harvest/](./raspberry-harvest/) | Raspberry harvest planning & management (SaaS) | 3000 |
| [dashboard/](./dashboard/) | Dashboard application | 3001 |

## Getting Started

Each project is fully independent. Navigate to the project directory and run:

```bash
cd raspberry-harvest  # or: cd dashboard
npm install
npm run dev
```

## CI

GitHub Actions runs lint, test, and build for each project independently as separate jobs.
