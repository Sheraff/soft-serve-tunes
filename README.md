

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

### Generating self-signed certificate for intranet streaming
- update openssl (not sure this is necessary, but it's what i did) (https://linuxhint.com/update-open-ssl-raspberry-pi/)
  ```sh
  cd /usr/local/src/
  wget https://www.openssl.org/source/openssl-3.0.7.tar.gz # or whatever version is the latest
  cd openssl-3.0.7
  sudo ./config --prefix=/usr/local/ssl --openssldir=/usr/local/ssl shared zlib
  sudo make # build from source, takes forever
  sudo make install # takes a while too
  cd /etc/ld.so.conf.d/
  sudo nano openssl-3.0.7.conf # write: /usr/local/ssl/lib
  sudo ldconfig -v
  sudo mv /usr/bin/openssl /usr/bin/openssl.BEKUP
  sudo mv /usr/bin/c_rehash /usr/bin/c_rehash.BEKUP
  sudo nano /etc/environment # write: PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/usr/local/ssl/bin"
  source /etc/environment # or open a new terminal
  openssl version # check everything worked
  cd /usr/local/src # cleanup
  sudo rm -rf openssl-3.0.7 # cleanup
  sudo rm openssl-3.0.7.tar.gz # cleanup
  ```
- generate cert
  ```sh
  openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -sha256 -days 36500
  sudo mkdir /etc/local-cert
  sudo mv cert.pem /etc/local-cert/cert.pem
  sudo mv key.pem /etc/local-cert/key.pem
  ```
- enable apache proxy for a specific port with newly generated certificates (in a .conf file inside /etc/apache2/sites-enabled)
  ```
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
        SSLCertificateFile /etc/local-cert/cert.pem
        SSLCertificateKeyFile /etc/local-cert/key.pem
  </VirtualHost>
  ```
- not necessary, but you might also want to force http connections to upgrade to https
  ```
  # in the *:80 VirtualHost
  RewriteCond %{SERVER_NAME} =192.168.0.13
  RewriteRule ^ https://192.168.0.13:8282 [END,NE,R=permanent]
  ```
- restart apache
  ```sh
  systemctl restart apache2
  ```
- you will be prompted to enter the passphrase used for generating the certificates.
  in a new terminal (because the previous one is hanging, waiting on the passphrase)
  ```sh
  sudo systemd-tty-ask-password-agent
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

   # if we want intranet streaming
   RewriteCond %{SERVER_NAME} =192.168.0.13
   RewriteRule ^ https://192.168.0.13:8282 [END,NE,R=permanent]
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
      SSLCertificateFile /etc/local-cert/cert.pem
      SSLCertificateKeyFile /etc/local-cert/key.pem
   </VirtualHost>
</IfModule>
