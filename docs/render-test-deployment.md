# Render test deployment

## What this repository deploys

The Render blueprint deploys only the Astro public site as a Docker web service. It does not deploy a self-hosted Pages CMS server.

Pages CMS should normally be used through its GitHub App. Content changes are committed to GitHub, and Render rebuilds the site.

## Blueprint

`render.yaml` defines:

```yaml
services:
  - type: web
    name: soccotash-sav-site
    env: docker
    rootDir: site
    autoDeploy: true
    plan: free
    envVars:
      - key: PORT
        value: "8080"
    healthCheckPath: /
```

The Dockerfile builds Astro, copies `dist/` into NGINX, and serves on port 8080.

## Render steps

1. Push the repository to GitHub.
2. In Render, create a new Blueprint from the GitHub repository, or create a Docker Web Service manually.
3. If using manual setup:
   - Language / environment: Docker
   - Root directory: `site`
   - Dockerfile path: `Dockerfile`
   - Environment variable: `PORT=8080`
   - Health check path: `/`
4. Deploy.
5. Open the `onrender.com` test URL.
6. Check `/`, `/local-guide/`, `/listings/`, `/guest-information/`, `/contact/` and one local guide page.

## Local validation commands

```bash
npm --prefix site ci
npm --prefix site run check
npm --prefix site run build
```
