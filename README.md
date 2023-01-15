

https://user-images.githubusercontent.com/1325721/212537689-021062ec-f67c-4b37-87b8-5309e1e062fb.mp4


![](favicon.png)

![](architecture.svg)

------

## TODO
- [ ] `linkAlbum` in `createTrack` fails a lot and slowly
  <details>
    <summary>prisma.track.update logic issue</summary>
    <pre>
    code: 'P2002',
    meta: { target: [ 'simplified', 'artistId', 'albumId' ] }
    </pre>
  </details>

- [ ] Track no. gets messed up if its info doesn't come from the
  same source as the album info


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
```
a2enmod proxy
a2enmod proxy_http
a2enmod proxy_wstunnel
systemctl restart apache2
```

### http2
```
cp /etc/apache2/mods-available/http2.load /etc/apache2/mods-enabled/http2.load
cp /etc/apache2/mods-available/http2.conf /etc/apache2/mods-enabled/http2.conf
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
  ```
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
