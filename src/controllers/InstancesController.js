const api = require('./ApiController');
require('dotenv').config();

const instanceScript = `
#cloud-config

packages:
  - nginx
  - php-fpm
  - php-mysqlnd 
  - php-gd 
  - php-cli 
  - php-curl 
  - php-mbstring 
  - php-bcmath 
  - php-zip 
  - php-opcache 
  - php-xml 
  - php-json 
  - php-intl
  - nfs-utils
  
write_files:
- content: |
    SELINUX=disabled
  path: /etc/selinux/config

- content: |
    user nginx;
    worker_processes auto;
    pid /run/nginx.pid;
    events { worker_connections 1024; }
    http {
      access_log off;
      error_log /dev/null crit;
      sendfile            on;
      tcp_nopush          on;
      tcp_nodelay         on;
      keepalive_timeout   65;
      types_hash_max_size 4096;
      include             /etc/nginx/mime.types;
      default_type        application/octet-stream;
      upstream php-fpm { server unix:/run/php-fpm/www.sock; }
      server {
        listen 80;
        server_name  ${process.env.BASEURL};
        root         /usr/share/nginx/html;
        index index.php index.html;
        location ~ \.php$ {
          include fastcgi_params;
          fastcgi_pass unix:/run/php-fpm/www.sock;
          fastcgi_split_path_info ^(.+\.php)(/.+)$;
          fastcgi_index index.php;
          fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
          try_files $uri $uri/ /index.php?$args;
        }
        location ~ \.(css|js|jpg|jpeg|png|gif)$ {
          expires 30d;
          add_header Cache-Control "public, max-age=2592000";
          try_files $uri =404;
        }
      }
      server {
        listen 443 ssl http2;
        server_name ${process.env.BASEURL};
        root /usr/share/nginx/html;
        index index.php index.html;
        ssl_certificate /etc/letsencrypt/live/${process.env.BASEURL}/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/${process.env.BASEURL}/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers 'TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384';
        location ~ \.php$ {
          include fastcgi_params;
          fastcgi_pass unix:/run/php-fpm/www.sock;
          fastcgi_split_path_info ^(.+\.php)(/.+)$;
          fastcgi_index index.php;
          fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
          try_files $uri $uri/ /index.php?$args;
        }
        location ~ \.(css|js|jpg|jpeg|png|gif)$ {
          expires 30d;
          add_header Cache-Control "public, max-age=2592000";
          try_files $uri =404;
        }
        gzip on;
        gzip_disable "msie6";
        gzip_types text/plain text/css application/json application/x-javascript text/xml application/xml application/xml+rss text/javascript;
        gzip_vary on;
      }
    }
  path: /etc/nginx/nginx.conf

- content: |
    [www]
    user = nginx
    group = nginx
    listen = /run/php-fpm/www.sock
    listen.acl_users = apache,nginx
    listen.allowed_clients = 127.0.0.1
    pm = dynamic
    pm.max_children = 50
    pm.start_servers = 5
    pm.min_spare_servers = 5
    pm.max_spare_servers = 35
    php_admin_value[error_log] = /dev/null
    php_admin_flag[log_errors] = off
    php_value[session.save_handler] = files
    php_value[session.save_path]    = /var/lib/php/session
    php_value[soap.wsdl_cache_dir]  = /var/lib/php/wsdlcache
  path: /etc/php-fpm.d/www.conf

runcmd:
  - setenforce 0
  - mkdir /etc/letsencrypt
  - echo "10.43.96.3:/storage /usr/share/nginx nfs defaults 0 0" >> /etc/fstab
  - echo "10.43.96.3:/etc/letsencrypt /etc/letsencrypt nfs defaults 0 0" >> /etc/fstab
  - mount -t nfs 10.43.96.3:/etc/letsencrypt /etc/letsencrypt
  - mount -t nfs 10.43.96.3:/storage /usr/share/nginx
  - firewall-cmd --zone=public --add-service=http --permanent
  - firewall-cmd --zone=public --add-service=https --permanent
  - firewall-cmd --zone=public --add-port=80/tcp --permanent
  - firewall-cmd --zone=public --add-port=443/tcp --permanent
  - firewall-cmd --reload
  - systemctl enable nginx
  - systemctl enable php-fpm
  - systemctl start nginx
  - systemctl start php-fpm

`;

exports.Plans = async (req = null, res = null, next = null) => {
    try {
        let ret = await api.Get('/plans');

        if (res) {
            return res.status(200).json(ret.data.plans);
        }
    } catch (error) {
        console.log('🔴 Erro Obtendo planos', error);
        return res.status(500).json({ error: 'Eror lendo planos' });
    }
};

exports.Create = async (req = null, res = null, next = null) => {
    try {
        // convertstring to base64
        const base64 = Buffer.from(instanceScript).toString('base64');

        const params = {
            region: 'sao',
            plan: 'vc2-1c-1gb-sc1',
            label: `${process.env.VULTR_SERVER_LABEL_PREFIX}_webserver`,
            os_id: 1868,
            user_data: base64, // Certifique-se de que instanceScript esteja definido corretamente
            backups: 'disabled',
            hostname: `${process.env.BASEURL}`,
            tags: ['webserver'],
            enable_vpc: true,
        };

        let ret = await api.Post('/instances', params);
        console.log('🟠 Criando instancia');

        if (res) {
            return res.status(200).json({ enviado: params, retorno: ret.data });
        }
    } catch (error) {
        console.log('🔴 Erro criando instancia', error);
        return res.status(500).json({ error: 'Erro ao criar a instância' });
    }
};

exports.Destroy = async (id) => {
    try {
        console.log(`🟠 Excluindo instancia ${id}`);
        let ret = await api.Delete(`/instances/${id}`);
        return ret.data;
    } catch (error) {
        console.log('🔴 Erro excluindo instancia', error);
        return null;
    }
};
