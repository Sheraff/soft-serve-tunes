# Create T3 App

This is an app bootstrapped according to the [init.tips](https://init.tips) stack, also known as the T3-Stack.

## Why are there `.js` files in here?

As per [T3-Axiom #3](https://github.com/t3-oss/create-t3-app/tree/next#3-typesafety-isnt-optional), we believe take typesafety as a first class citizen. Unfortunately, not all frameworks and plugins support TypeScript which means some of the configuration files have to be `.js` files.

We try to emphasize that these files are javascript for a reason, by explicitly declaring its type (`cjs` or `mjs`) depending on what's supported by the library it is used by. Also, all the `js` files in this project are still typechecked using a `@ts-check` comment at the top.

## What's next? How do I make an app with this?

We try to keep this project as simple as possible, so you can start with the most basic configuration and then move on to more advanced configuration.

If you are not familiar with the different technologies used in this project, please refer to the respective docs. If you still are in the wind, please join our [Discord](https://t3.gg/discord) and ask for help.

- [Next-Auth.js](https://next-auth.js.org)
- [Prisma](https://prisma.io)
- [TailwindCSS](https://tailwindcss.com)
- [tRPC](https://trpc.io) (using @next version? [see v10 docs here](https://alpha.trpc.io))

## How do I deploy this?

### Vercel

We recommend deploying to [Vercel](https://vercel.com/?utm_source=t3-oss&utm_campaign=oss). It makes it super easy to deploy NextJs apps.

- Push your code to a GitHub repository.
- Go to [Vercel](https://vercel.com/?utm_source=t3-oss&utm_campaign=oss) and sign up with GitHub.
- Create a Project and import the repository you pushed your code to.
- Add your environment variables.
- Click **Deploy**
- Now whenever you push a change to your repository, Vercel will automatically redeploy your website!

### Docker

You can also dockerize this stack and deploy a container.

1. In your [next.config.mjs](./next.config.mjs), add the `output: "standalone"` option to your config.
2. Create a `.dockerignore` file with the following contents:
   <details>
   <summary>.dockerignore</summary>

   ```
   Dockerfile
   .dockerignore
   node_modules
   npm-debug.log
   README.md
   .next
   .git
   ```

  </details>

3. Create a `Dockerfile` with the following contents:
   <details>
   <summary>Dockerfile</summary>

   ```Dockerfile
   # Install dependencies only when needed
   FROM node:16-alpine AS deps
   # Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
   RUN apk add --no-cache libc6-compat
   WORKDIR /app

   # Install dependencies based on the preferred package manager
   COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
   RUN \
      if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
      elif [ -f package-lock.json ]; then npm ci; \
      elif [ -f pnpm-lock.yaml ]; then yarn global add pnpm && pnpm i; \
      else echo "Lockfile not found." && exit 1; \
      fi


   # Rebuild the source code only when needed
   FROM node:16-alpine AS builder
   WORKDIR /app
   COPY --from=deps /app/node_modules ./node_modules
   COPY . .

   # Next.js collects completely anonymous telemetry data about general usage.
   # Learn more here: https://nextjs.org/telemetry
   # Uncomment the following line in case you want to disable telemetry during the build.
   # ENV NEXT_TELEMETRY_DISABLED 1

   RUN yarn build

   # If using npm comment out above and use below instead
   # RUN npm run build

   # Production image, copy all the files and run next
   FROM node:16-alpine AS runner
   WORKDIR /app

   ENV NODE_ENV production
   # Uncomment the following line in case you want to disable telemetry during runtime.
   # ENV NEXT_TELEMETRY_DISABLED 1

   RUN addgroup --system --gid 1001 nodejs
   RUN adduser --system --uid 1001 nextjs

   # You only need to copy next.config.js if you are NOT using the default configuration
   # COPY --from=builder /app/next.config.js ./
   COPY --from=builder /app/public ./public
   COPY --from=builder /app/package.json ./package.json

   # Automatically leverage output traces to reduce image size
   # https://nextjs.org/docs/advanced-features/output-file-tracing
   COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
   COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

   USER nextjs

   EXPOSE 3000

   ENV PORT 3000

   CMD ["node", "server.js"]
   ```

  </details>

4. You can now build an image to deploy yourself, or use a PaaS such as [Railway's](https://railway.app) automated [Dockerfile deployments](https://docs.railway.app/deploy/dockerfiles) to deploy your app.

## Useful resources

Here are some resources that we commonly refer to:

- [Protecting routes with Next-Auth.js](https://next-auth.js.org/configuration/nextjs#unstable_getserversession)



------

## Deploy to raspberry

### update raspbian 
need an arm64 OS, as prisma doesn't work on 32bits systems
https://www.raspberrypi.com/software/

### access rpi
freebox > box settings > ports > 
- 22 > 22
- if terminal isn't happy because it's a new unknown source `ssh-keygen -R [host]`

### app
install node, upgrade to 18
git clone the project
install `npm i`
configure .env music folder
build (put pi on a fan, it's gonna heat up) `npm run build`
`rm prisma/db.sqlite`
`npm run db`
`npm start`

### ports
freebox > static local IP for server
configure DynDNS w/ OVH + freebox
freebox > box settings > ports > 
- 443 > 3000 (https)
- 80 > 3000 (http)
- 3001 > 3001 (ws) ??useless??
- site should be accessible over HTTP

### ssl certificates
- `apt-get install apache2`
- freebox ports should be set to their default value (443 > 443, 80 > 80)
- install cert-bot by let's encrypt (https://certbot.eff.org/instructions?ws=apache&os=debianbuster)
- in /etc/apache2/sited-enabled, edit the .conf files (see example below) so that
  - all HTTP traffic is redirected to HTTPS
  - incoming 443 and outgoing 3000 go to the correct destination
  - HTTP upgrade requests go to the correct scheme http>ws and ws>http

- make sure apache version is >= 2.4 (`apache2 -v`)
- enable some apache modules
```
a2enmod proxy
a2enmod proxy_http
a2enmod proxy_wstunnel
systemctl restart apache2
```


## example .conf files
### /etc/apache2/sites-enabled/000-default.conf
```
<VirtualHost *:80>
   ErrorLog ${APACHE_LOG_DIR}/error.log
   CustomLog ${APACHE_LOG_DIR}/access.log combined

   # added by certbot
   RewriteEngine on
   RewriteCond %{SERVER_NAME} =rpi.florianpellet.com
   RewriteRule ^ https://%{SERVER_NAME}%{REQUEST_URI} [END,NE,R=permanent]
</VirtualHost>
```

### /etc/apache2/sites-enabled/000-default-le-ssl.conf (created by certbot)
```
<IfModule mod_ssl.c>
   <VirtualHost *:443>

      ProxyPreserveHost On
      ProxyRequests Off
      ServerName rpi.florianpellet.com

      RewriteEngine On
      RewriteCond %{HTTP:Upgrade} =websocket [NC]
      RewriteRule /(.*)           ws://localhost:3001/$1 [P,L]
      RewriteCond %{HTTP:Upgrade} !=websocket [NC]
      RewriteRule /(.*)           http://localhost:3000/$1 [P,L]

      ProxyPass / http://localhost:3000/
      ProxyPassReverse / http://localhost:3000/

      ErrorLog ${APACHE_LOG_DIR}/error.log
      CustomLog ${APACHE_LOG_DIR}/access.log combined

      # certbot
      ServerName rpi.florianpellet.com
      SSLCertificateFile /etc/letsencrypt/live/rpi.florianpellet.com/fullchain.pem
      SSLCertificateKeyFile /etc/letsencrypt/live/rpi.florianpellet.com/privkey.pem
      Include /etc/letsencrypt/options-ssl-apache.conf
   </VirtualHost>
</IfModule>