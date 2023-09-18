# WBalance
Welm Load Balance


# configuracao do LoadBalance

echo SELINUX=disabled > /etc/selinux/config
reboot

groupadd -g 980 nginx
useradd -u 980 -g 980 -d /storage -m nginx
mkdir /storage
chown nginx:nginx /storage

dnf install vsftpd -y

echo > /etc/vsftpd/vsftpd.conf
echo anonymous_enable=NO >> /etc/vsftpd/vsftpd.conf
echo local_enable=YES >> /etc/vsftpd/vsftpd.conf
echo write_enable=YES >> /etc/vsftpd/vsftpd.conf
echo local_umask=022 >> /etc/vsftpd/vsftpd.conf
echo dirmessage_enable=YES >> /etc/vsftpd/vsftpd.conf
echo xferlog_enable=YES >> /etc/vsftpd/vsftpd.conf
echo connect_from_port_20=YES >> /etc/vsftpd/vsftpd.conf
echo xferlog_std_format=YES >> /etc/vsftpd/vsftpd.conf
echo listen=YES >> /etc/vsftpd/vsftpd.conf
echo listen_ipv6=NO >> /etc/vsftpd/vsftpd.conf
echo pam_service_name=vsftpd >> /etc/vsftpd/vsftpd.conf
echo userlist_enable=YES >> /etc/vsftpd/vsftpd.conf
echo chroot_local_user=YES >> /etc/vsftpd/vsftpd.conf
echo allow_writeable_chroot=YES >> /etc/vsftpd/vsftpd.conf
echo local_root=/storage >> /etc/vsftpd/vsftpd.conf

systemctl restart vsftpd
systemctl enable vsftpd

dnf install nfs-utils -y
echo /storage 10.43.96.0/24\(rw,sync,no_root_squash\) > /etc/exports
systemctl enable --now rpcbind nfs-server
firewall-cmd --add-service={nfs,nfs3,mountd,rpc-bind, http, https, ftp}
firewall-cmd --runtime-to-permanent
firewall-cmd --reload

dnf install nodejs -y
npm install pm2 -g
cd /
git clone https://github.com/alowelter/WBalance.git
cd WBalance
npm install

dnf install certbot -y
certbot certonly


pm2 start pm2.json




