const api = require('./api');
require('dotenv').config();

const instanceScript = `#cloud-config
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
    error_log /var/log/nginx/error.log;
    pid /run/nginx.pid;
    include /usr/share/nginx/modules/*.conf;
    events {
       worker_connections 1024;
    }
    http {
      log_format  main  '$remote_addr - $remote_user [$time_local] "$request" '
                        '$status $body_bytes_sent "$http_referer" '
                        '"$http_user_agent" "$http_x_forwarded_for"';
      access_log  /var/log/nginx/access.log  main;
      sendfile            on;
      tcp_nopush          on;
      tcp_nodelay         on;
      keepalive_timeout   65;
      types_hash_max_size 4096;
      include             /etc/nginx/mime.types;
      default_type        application/octet-stream;
      include /etc/nginx/conf.d/*.conf;
      server {
              listen       80;
              listen       [::]:80;
              server_name  _;
              root         /usr/share/nginx/html;
              index index.php index.html;
              try_files $uri $uri/ /index.php?$args;
              location ~ \.php$ {
                include fastcgi_params;
                fastcgi_pass unix:/run/php-fpm/www.sock;
                fastcgi_split_path_info ^(.+\.php)(/.+)$;
                fastcgi_index index.php;
                fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
              }
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
    slowlog = /var/log/php-fpm/www-slow.log
    php_admin_value[error_log] = /var/log/php-fpm/www-error.log
    php_admin_flag[log_errors] = on
    php_value[session.save_handler] = files
    php_value[session.save_path]    = /var/lib/php/session
    php_value[soap.wsdl_cache_dir]  = /var/lib/php/wsdlcache
  path: /etc/php-fpm.d/www.conf

runcmd:
  - mount -t nfs 10.43.96.3:/storage /usr/share/nginx/html
  - echo "10.43.96.3:/storage /usr/share/nginx/html nfs defaults 0 0" >> /etc/fstab
  - firewall-cmd --zone=public --add-service=http --permanent
  - firewall-cmd --reload

power_state:
  delay: "now"
  mode: reboot
  message: Reboot after install
  condition: True`;

exports.Create = async (req, res, next) => {
    const params = {
        region: 'ewr',
        plan: 'vc2-6c-16gb',
        label: `${process.env.VULTR_SERVER_LABEL_PREFIX}_webserver`,
        os_id: 215,
        user_data: instanceScript.tobase64(), // Certifique-se de que instanceScript esteja definido corretamente
        backups: 'disabled',
        hostname: `${process.env.VULTR_SERVER_LABEL_PREFIX}_webserver`,
        tags: ['webserver'],
    };
    let os = await api.post('https://api.vultr.com/v2/os', params, {
        headers: {
            Authorization: `Bearer ${process.env.VULTR_API_KEY}`,
        },
    });
    console.log(os);

    /*
    try {
        api.post('https://api.vultr.com/v2/instances', params, {
            headers: {
                Authorization: `Bearer ${process.env.VULTR_API_KEY}`,
            },
        });
    } catch (error) {
        // Lide com erros aqui
        return res.status(500).json({ error: 'Erro ao criar a instância' });
    }
    */
};
