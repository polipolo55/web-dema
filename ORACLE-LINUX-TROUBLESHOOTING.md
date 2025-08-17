# 🛠️ Oracle Linux Troubleshooting Guide

## Oracle Linux Specific Commands & Solutions

### 🔍 System Information
```bash
# Check Oracle Linux version
cat /etc/oracle-release

# Check system architecture
uname -m

# Check running services
systemctl list-units --type=service --state=running

# Check system resources
free -h
df -h
```

### 🔥 Firewall (firewalld) Commands
```bash
# Check firewall status
sudo firewall-cmd --state

# List all services allowed
sudo firewall-cmd --list-services

# List all ports allowed
sudo firewall-cmd --list-ports

# Add HTTP/HTTPS permanently
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload

# Add custom port (if needed)
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload

# Check all rules
sudo firewall-cmd --list-all
```

### 🛡️ SELinux Commands
```bash
# Check SELinux status
getenforce

# Check SELinux context for files
ls -Z /home/opc/web-dema/

# Allow HTTP network connections (already done in script)
sudo setsebool -P httpd_can_network_connect 1
sudo setsebool -P httpd_can_network_relay 1

# Check SELinux booleans
sudo getsebool -a | grep http

# If you need to disable SELinux temporarily (not recommended)
sudo setenforce 0  # Temporary
# To make permanent: edit /etc/selinux/config
```

### 📦 Package Management (DNF)
```bash
# Update all packages
sudo dnf update -y

# Search for packages
sudo dnf search nodejs

# Install packages
sudo dnf install -y package-name

# Remove packages
sudo dnf remove package-name

# List installed packages
dnf list installed

# Check package information
dnf info nodejs

# Enable repositories
sudo dnf config-manager --enable repository-name
```

### 🔧 Node.js & PM2 on Oracle Linux
```bash
# Check Node.js version
node --version
npm --version

# PM2 commands
pm2 status
pm2 logs dema-website
pm2 restart dema-website
pm2 stop dema-website
pm2 start dema-website

# PM2 startup configuration
pm2 startup systemd
pm2 save

# PM2 monitoring
pm2 monit
```

### 🌐 Nginx on Oracle Linux
```bash
# Check Nginx status
sudo systemctl status nginx

# Start/Stop/Restart Nginx
sudo systemctl start nginx
sudo systemctl stop nginx
sudo systemctl restart nginx
sudo systemctl reload nginx

# Test Nginx configuration
sudo nginx -t

# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Check Nginx access logs
sudo tail -f /var/log/nginx/access.log

# List Nginx configuration files
ls -la /etc/nginx/conf.d/
```

### 🚨 Common Oracle Linux Issues & Solutions

#### Issue 1: Permission Denied Errors
```bash
# Check file permissions
ls -la /home/opc/web-dema/

# Fix ownership
sudo chown -R opc:opc /home/opc/web-dema/

# Fix permissions
chmod -R 755 /home/opc/web-dema/
```

#### Issue 2: Port Not Accessible
```bash
# Check if port is open in firewall
sudo firewall-cmd --list-ports

# Add port if missing
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --reload

# Check if service is listening on port
sudo netstat -tlnp | grep :80
sudo ss -tlnp | grep :80
```

#### Issue 3: SELinux Blocking Connections
```bash
# Check SELinux denials
sudo sealert -a /var/log/audit/audit.log

# Allow HTTP connections
sudo setsebool -P httpd_can_network_connect 1

# If you need to allow specific ports (example)
sudo semanage port -a -t http_port_t -p tcp 3000
```

#### Issue 4: SSL Certificate Issues
```bash
# Check if port 443 is open
sudo firewall-cmd --list-ports | grep 443

# Test SSL manually
openssl s_client -connect yourdomain.com:443

# Renew certificate
sudo certbot renew --dry-run

# Check certificate expiry
sudo certbot certificates
```

#### Issue 5: Node.js Application Not Starting
```bash
# Check Node.js path
which node
which npm

# Check environment variables
printenv | grep NODE

# Run application manually to see errors
cd /home/opc/web-dema
node server.js

# Check application logs
pm2 logs dema-website --lines 50
```

### 📊 System Monitoring
```bash
# Check system load
top
htop  # If installed

# Check memory usage
free -h

# Check disk usage
df -h

# Check network connections
ss -tulnp

# Check running processes
ps aux | grep node
ps aux | grep nginx
```

### 🔄 Service Management
```bash
# Enable services to start on boot
sudo systemctl enable nginx
sudo systemctl enable firewalld

# Check service status
sudo systemctl is-enabled nginx
sudo systemctl is-active nginx

# Restart all related services
sudo systemctl restart nginx
pm2 restart all
```

### 🚀 Performance Optimization
```bash
# Check system limits
ulimit -a

# Increase file descriptor limits (if needed)
echo "* soft nofile 65536" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65536" | sudo tee -a /etc/security/limits.conf

# Enable performance governor (for ARM instances)
echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor
```

### 📝 Log Locations
- **System logs**: `/var/log/messages`
- **Nginx logs**: `/var/log/nginx/`
- **PM2 logs**: `~/.pm2/logs/`
- **Application logs**: `/home/opc/web-dema/logs/`
- **SELinux logs**: `/var/log/audit/audit.log`
- **Firewall logs**: `/var/log/firewalld`

### 🆘 Emergency Recovery
```bash
# If website is down, check in order:
1. pm2 status
2. sudo systemctl status nginx
3. sudo firewall-cmd --list-services
4. curl http://localhost:3000
5. pm2 logs dema-website

# Restart everything
pm2 restart all
sudo systemctl restart nginx
sudo firewall-cmd --reload
```

This troubleshooting guide covers Oracle Linux specific commands and common issues you might encounter!
