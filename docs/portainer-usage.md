# Using Portainer with Soccotash on Linux Mint

Portainer Community Edition provides a browser-based graphical interface for the Docker Engine already installed on the Linux Mint development machine.

It can be used to manage the same Docker containers that are started from the Soccotash project with Docker Compose.

## What Portainer provides

Portainer can be used to view and manage:

- running and stopped containers;
- container health;
- container logs;
- CPU and memory usage;
- Docker images;
- Docker volumes;
- Docker networks;
- Docker Compose stacks;
- container start, stop and restart operations;
- interactive container consoles.

For the current Soccotash setup, Portainer should display containers such as:

```text
soccotash-site-1
soccotash-database-1
portainer
```

## Recommended arrangement

The recommended local arrangement is:

```text
Linux Mint
└── Docker Engine
    ├── Soccotash Astro/Node application
    ├── PostgreSQL
    └── Portainer Community Edition
```

Portainer runs as another Docker container. It does not replace the existing Docker Engine.

## Install Portainer

Create a persistent Docker volume for Portainer:

```bash
docker volume create portainer_data
```

Start Portainer:

```bash
docker run -d \
  --name portainer \
  --restart=always \
  -p 9443:9443 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:sts
```

The `portainer_data` volume preserves Portainer's configuration and administrator account between container replacements or restarts.

Port `8000` is not required for this local setup. It is primarily used for Portainer Edge Agent functionality.

## Open Portainer

Open the following address in a browser on the Mint machine:

```text
https://localhost:9443
```

The browser may initially display a certificate warning because Portainer uses a self-signed HTTPS certificate by default.

Proceed to the site, create the Portainer administrator account, and select the local Docker environment.

## Managing Soccotash

After signing in:

1. Open the local Docker environment.
2. Select **Containers**.
3. Open `soccotash-site-1` to inspect the Astro/Node application.
4. Open `soccotash-database-1` to inspect PostgreSQL.

Useful Portainer operations include:

- viewing live application logs;
- viewing PostgreSQL startup and health logs;
- restarting an individual service;
- checking whether a container is healthy;
- inspecting environment variables;
- viewing attached Docker networks;
- opening a shell inside a container;
- checking container CPU and memory usage.

## Docker Compose remains the source of truth

Portainer can start, stop and inspect Soccotash, but the project `compose.yaml` should remain the authoritative definition of the local stack.

Continue to use commands such as:

```bash
docker compose up --build -d
```

```bash
docker compose down
```

```bash
npm run docker:sync
```

```bash
npm run docker:report
```

Changes to services, environment variables, volumes, ports or health checks should normally be made in `compose.yaml` and `.env`, rather than edited manually inside Portainer.

## Portainer stacks

Portainer can also deploy Docker Compose configurations as **Stacks**.

For Soccotash, this could later be done by:

- pasting the Compose file into Portainer;
- uploading a Compose file;
- connecting Portainer to the GitHub repository.

For current development, it is simpler to continue launching Soccotash from the terminal and use Portainer primarily for monitoring, logs and container administration.

## Restarting Portainer

Restart Portainer with:

```bash
docker restart portainer
```

View its logs with:

```bash
docker logs portainer
```

Follow its logs continuously with:

```bash
docker logs -f portainer
```

## Stopping or removing Portainer

Stop it with:

```bash
docker stop portainer
```

Start it again with:

```bash
docker start portainer
```

Remove the Portainer container with:

```bash
docker rm -f portainer
```

Removing the container does not remove the saved configuration because it remains in the `portainer_data` volume.

To remove the saved Portainer configuration as well:

```bash
docker volume rm portainer_data
```

Only remove the volume when the saved Portainer configuration is no longer required.

## Why Portainer is preferable to Docker Desktop here

Docker Desktop for Linux runs a separate virtual machine and normally uses a separate Docker context.

That can result in:

- separate containers and images;
- duplicated Docker environments;
- additional memory usage;
- possible port conflicts;
- confusion between the native Docker Engine and Docker Desktop.

Portainer connects directly to the existing Mint Docker Engine, so it can manage the current Soccotash containers without changing the architecture.

## Security considerations

Portainer is given access to:

```text
/var/run/docker.sock
```

This gives Portainer extensive control over Docker and effectively substantial control over the Mint host.

For that reason:

- use a strong Portainer administrator password;
- do not expose port `9443` directly to the public internet;
- keep access limited to the Mint machine or trusted local network;
- do not store secrets in screenshots or shared logs;
- keep the Portainer image updated;
- do not allow untrusted users to access the Portainer interface.

## Updating Portainer

To update Portainer:

```bash
docker pull portainer/portainer-ce:sts
docker rm -f portainer
```

Then run the original `docker run` command again:

```bash
docker run -d \
  --name portainer \
  --restart=always \
  -p 9443:9443 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:sts
```

The existing administrator account and settings should be retained in the `portainer_data` volume.

## Recommended use for Soccotash

Use Portainer for:

- confirming that the website and database containers are healthy;
- viewing application and database logs;
- restarting a failed container;
- monitoring resource usage;
- opening a temporary container console;
- checking Docker volumes and networks.

Use Docker Compose and the Soccotash project files for:

- defining services;
- changing environment variables;
- changing ports;
- adding containers;
- configuring health checks;
- deploying updated application images;
- reproducing the setup on another development machine.
