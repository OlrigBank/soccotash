# Deployment guide

## Local build

```bash
npm install --prefix site
npm run build
```

## Docker build

```bash
cd site
docker build -t soccotash-sav-site .
docker run --rm -p 8080:8080 soccotash-sav-site
```

Then open `http://localhost:8080`.

## Render

The root `render.yaml` defines one web service:

```yaml
services:
  - type: web
    name: soccotash-sav-site
    env: docker
    rootDir: site
```

This deploys the Astro site as a static NGINX-served Docker image.
