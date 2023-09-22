# WBalance
Welm Load Balance


# configuracao do LoadBalance usando cloud-config

#cloud-config

packages:
  - vsftpd
  - nodejs
  - nfs-utils
  - certbot

write_files:
- content: |
    SELINUX=disabled
  path: /etc/selinux/config

write_files:
- content: |
    echo anonymous_enable=NO
    echo local_enable=YES
    echo write_enable=YES
    local_umask=022
    dirmessage_enable=YES
    xferlog_enable=YES
    connect_from_port_20=YES
    xferlog_std_format=YES
    listen=YES
    listen_ipv6=NO
    pam_service_name=vsftpd
    userlist_enable=YES
    chroot_local_user=YES
    allow_writeable_chroot=YES
    local_root=/storage
  path: /etc/vsftpd/vsftpd.conf

runcmd:
  - setenforce 0
  - groupadd -g 980 nginx
  - useradd -u 980 -g 980 -d /storage -m nginx
  - chown nginx:nginx /storage
  - mkdir /storage
  - echo /storage 10.43.96.0/24\(rw,sync,no_root_squash\) > /etc/exports
  - exportfs -a
  - systemctl enable vsftpd
  - systemctl restart vsftpd
  - cd / && git clone https://github.com/alowelter/WBalance.git
  - cd /WBalance && npm install
  - npm install pm2 -g
  - systemctl enable --now rpcbind nfs-server
  - firewall-cmd --add-service={nfs,nfs3,mountd,rpc-bind, http, https, ftp}
  - firewall-cmd --runtime-to-permanent
  - firewall-cmd --reload
  - certbot certonly --standalone --email marcelo@alolwelter.com.br --agree-tos -d example.com
  - cd /WBalance && pm2 start pm2.json && pm2 startup && pm2 save
