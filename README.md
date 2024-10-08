

https://user-images.githubusercontent.com/1325721/212537689-021062ec-f67c-4b37-87b8-5309e1e062fb.mp4


![](favicon.png)

![](architecture.svg)

------

## If anyone ever uses this repo...

...You should tell me so I can plan accordingly! Because I'm not writing any data migration scripts (for server database, for client indexedDB, for service-worker cache) and I do the changes manually, but that's not very practical for anyone else but me. So if you have the project running and try to update it after some changes, stuff might break.

## Commands

| command         | description                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run db`    | runs necessary prisma scripts after a change in schema                                                                                                                                            |
| `npm run spawn` | starts a process in `pm2` after a build (if a process already exists, you should `pm2 delete soft-serve-tunes` before)                                                                            |
| `npm run wake`  | server cold start is quite long (because we're verifying all files in case anything changed while the server was off) ; this command starts the cold-start process without having to open the app |

------


## RESOURCES
- favicon: https://realfavicongenerator.net/
- app icon: https://huggingface.co/spaces/stabilityai/stable-diffusion-1
- maskable app icon: https://maskable.app/editor
- icons:
  - https://fonts.google.com/icons?icon.set=Material+Symbols&icon.style=Rounded
  - [internal readme](src/icons/README.md)
- eased gradients: https://larsenwork.com/easing-gradients/
- postgres.app: https://postgresapp.com/
- acoustid fingerprinting:
  - fpcalc binary: https://github.com/acoustid/chromaprint/releases
  - [internal readme](src/server/persistent/bin/fpcalc/README.md)
- texts: https://chat.openai.com/
- svg loaders: https://github.com/SamHerbert/SVG-Loaders
- logos: https://www.vectorlogo.zone/

## Deploy to raspberry

### update raspbian
- need an arm64 OS, as prisma doesn't work on 32bits systems https://www.raspberrypi.com/software/
- need musl for "sharp" image processing: `sudo apt install musl:arm64`

### access rpi
freebox > box settings > ports > 
- 22 > 22
- if terminal isn't happy because it's a new unknown source `ssh-keygen -R [host]`

### app
- install node, upgrade to 18
  ```sh
  sudo su
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
  sudo apt install nodejs # or follow CLI instructions
  ```
- install git
  ```sh
  sudo apt install git
  ```
- git clone the project
  ```sh
  git clone https://github.com/Sheraff/soft-serve-tunes.git
  ```
- some binaries need chmoding
  ```sh
  chmod u+rx .src/server/persistent/bin/fpcalc/fpcalc-darwin
  chmod u+rx .src/server/persistent/bin/fpcalc/fpcalc-linux
  ```
  also, I could not find a self-contained `fpcalc` for linux, so we need to install 250Mo of dependencies (which will include fpcalc itself) (see [server/bin readme](src/server/persistent/bin/fpcalc/README.md) for more information)
  ```sh
  apt-get install libchromaprint-tools
  ```
- install postgresql (https://pimylifeup.com/raspberry-pi-postgresql/)
  ```sh
  sudo apt install postgresql
  createuser pi -P --interactive # will determine the user:password to use in the .env file
  psql
  CREATE DATABASE pi;
  exit
  exit
  ```
- install `npm i`
- configure .env music folder
- build (put pi on a fan, it's gonna heat up) `npm run build`
- `rm prisma/db.sqlite`
- `npm run db`
- `npm start`

### ports
freebox > static local IP for server
- freebox settings > advanced > DHCP > static
- assign raspberry pi to static IP
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
  ```sh
  sudo apt install snapd
  sudo snap install core; sudo snap refresh core
  sudo snap install --classic certbot
  sudo ln -s /snap/bin/certbot /usr/bin/certbot
  sudo certbot --apache
  ```
- in /etc/apache2/sited-enabled, edit the .conf files (see example below) so that
  - all HTTP traffic is redirected to HTTPS
  - incoming 443 and outgoing 3000 go to the correct destination
  - HTTP upgrade requests go to the correct scheme http>ws and ws>http

- make sure apache version is >= 2.4 (`apache2 -v`)
- enable some apache modules
  ```sh
  a2enmod proxy
  a2enmod proxy_http
  a2enmod proxy_wstunnel
  systemctl restart apache2
  ```

### enable http2
```sh
cp /etc/apache2/mods-available/http2.load /etc/apache2/mods-enabled/http2.load
cp /etc/apache2/mods-available/http2.conf /etc/apache2/mods-enabled/http2.conf
systemctl restart apache2
```

### remove apache headers / server signature
- edit the security config file
  ```sh
  nano /etc/apache2/conf-enabled/security.conf
  ```
- Replace the 2 following settings:
  ```conf
  ServerTokens Prod # remove `Server` header w/ OS version and apache version
  ServerSignature Off # hide information from server generated pages (e.g. Internal Server Error).
  ```
- restart apache
  ```sh
  systemctl restart apache2
  ```

### process manager
- install pm2 `npm install pm2@latest -g`
- spawn the server w/ `npm run spawn` or `pm2 start npm --time --name soft-serve-tunes -- start`
- subsequent re-start can be done w/ `pm2 reload 0` or `pm2 reload soft-serve-tunes`
- auto-start pm2 on reboot: 
  ```sh
  pm2 startup
  pm2 save
  ```

### If using wifi
#### Prevent connection "timeout after idle"
The raspberry pi comes with a power management utility on its wifi chip. This results in 
connections that are very slow / timeout if the raspberry hasn't connected to the network in 
a while. [This forum post helped.](https://forums.raspberrypi.com/viewtopic.php?t=231125)
- observe the "Power Management" setting w/ `iwconfig`
  ```yaml
  wlan0
      Power Management:on
  ```
- disable power management `sudo iwconfig wlan0 power off`
- disable power management permanently:
  - `sudo nano /etc/rc.local`
  - add `iwconfig wlan0 power off` to the file

### If using ethernet
#### Disable wifi
Disabling the wifi can boost raspberry performance. [This article helped.](https://linuxhint.com/disable-raspberry-pi-wifi-3-methods/)
```sh
sudo nano /boot/config.txt
```
add `dtoverlay=disable-wifi` to the config, under `[all]`

### Intranet streaming
If you want to stream directly server-to-device without going through the internet *when both
are on the same network*, you need to setup a few more things:
- Create a DNS A record that resolves to the static IP assigned to the raspberry pi server
- Generate a certificate by using a DNS challenge (since the domain cannot be accessed outside of
your network, certificate authority can only access the DNS record): 
https://www.digitalocean.com/community/tutorials/how-to-acquire-a-let-s-encrypt-certificate-using-dns-validation-with-acme-dns-certbot-on-ubuntu-18-04
  ```sh
  wget https://github.com/joohoi/acme-dns-certbot-joohoi/raw/master/acme-dns-auth.py
  chmod +x acme-dns-auth.py
  nano acme-dns-auth.py # change the shebang to use python3 instead of python
  sudo mv acme-dns-auth.py /etc/letsencrypt/ # where letsencrypt can find it
  sudo certbot certonly --manual --manual-auth-hook /etc/letsencrypt/acme-dns-auth.py --preferred-challenges dns --debug-challenges -d local.my-domain.com
  # certbot will prompt you to go and register a CNAME DNS redirection from your domain
  # to theirs, so they can verify that you do own the domain, do that, and check that it
  # is correctly registered with `dig _acme-challenge.local.my-domain.com`
  sudo certbot renew --dry-run # make sure the new cert is included in the auto-renew rotation
  ```
- enable apache proxy with new local host and newly generated certificates (in a .conf file inside /etc/apache2/sites-enabled)
  ```conf
  <VirtualHost *:443>
        ProxyPreserveHost On
        ProxyRequests Off
        # name doesn't matter (unless self-signed certificate wasn't wildcard but on a specific domain)
        ServerName foobar.com
        ServerAlias *

        RewriteEngine On
        RewriteCond %{HTTP:Upgrade} =websocket [NC]
        RewriteRule /(.*)           ws://localhost:3001/$1 [P,L]
        RewriteCond %{HTTP:Upgrade} !=websocket [NC]
        RewriteRule /(.*)           http://localhost:3000/$1 [P,L]

        ProxyPass / http://localhost:3000/
        ProxyPassReverse / http://localhost:3000/

        ErrorLog ${APACHE_LOG_DIR}/error.log
        CustomLog ${APACHE_LOG_DIR}/access.log combined

        # self signed
        SSLCertificateFile /etc/letsencrypt/live/local.my-domain.com/fullchain.pem
        SSLCertificateKeyFile /etc/letsencrypt/live/local.my-domain.com/privkey.pem
        Include /etc/letsencrypt/options-ssl-apache.conf
  </VirtualHost>
  ```
- not necessary, but you might also want to force http connections to upgrade to https
  ```conf
  # in the *:80 VirtualHost
  RewriteCond %{SERVER_NAME} =local.my-domain.com
  RewriteRule ^ https://%{SERVER_NAME}%{REQUEST_URI} [END,NE,R=permanent]
  ```
- restart apache
  ```sh
  systemctl restart apache2
  ```
- add the local host to .env file
  ```env
  NEXT_PUBLIC_INTRANET_HOST=https://local.my-domain.com
  ```

## example .conf files
### /etc/apache2/sites-enabled/000-default.conf
```conf
<VirtualHost *:80>
   ErrorLog ${APACHE_LOG_DIR}/error.log
   CustomLog ${APACHE_LOG_DIR}/access.log combined

   # added by certbot
   RewriteEngine on
   RewriteCond %{SERVER_NAME} =my-domain.com
   RewriteRule ^ https://%{SERVER_NAME}%{REQUEST_URI} [END,NE,R=permanent]

   # if we want intranet streaming
   RewriteCond %{SERVER_NAME} =local.my-domain.com
   RewriteRule ^ https://%{SERVER_NAME}%{REQUEST_URI} [END,NE,R=permanent]
</VirtualHost>
```

### /etc/apache2/sites-enabled/000-default-le-ssl.conf (created by certbot)
```conf
<IfModule mod_ssl.c>
   <VirtualHost *:443>

      ProxyPreserveHost On
      ProxyRequests Off
      ServerName my-domain.com

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
      ServerName my-domain.com
      SSLCertificateFile /etc/letsencrypt/live/my-domain.com/fullchain.pem
      SSLCertificateKeyFile /etc/letsencrypt/live/my-domain.com/privkey.pem
      Include /etc/letsencrypt/options-ssl-apache.conf
   </VirtualHost>

   # if we want intranet streaming
   <VirtualHost *:443>
        ProxyPreserveHost On
        ProxyRequests Off
        # name doesn't matter (unless self-signed certificate wasn't wildcard but on a specific domain)
        ServerName foobar.com
        ServerAlias *

        RewriteEngine On
        RewriteCond %{HTTP:Upgrade} =websocket [NC]
        RewriteRule /(.*)           ws://localhost:3001/$1 [P,L]
        RewriteCond %{HTTP:Upgrade} !=websocket [NC]
        RewriteRule /(.*)           http://localhost:3000/$1 [P,L]

        ProxyPass / http://localhost:3000/
        ProxyPassReverse / http://localhost:3000/

        ErrorLog ${APACHE_LOG_DIR}/error.log
        CustomLog ${APACHE_LOG_DIR}/access.log combined

        # self signed
        SSLCertificateFile /etc/letsencrypt/live/local.my-domain.com/fullchain.pem
        SSLCertificateKeyFile /etc/letsencrypt/live/local.my-domain.com/privkey.pem
        Include /etc/letsencrypt/options-ssl-apache.conf
   </VirtualHost>
</IfModule>
```
