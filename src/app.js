const useHttp = require('http');
const useHttps = require('https');
const httpProxy = require('http-proxy');
const fs = require('fs');
const os = require('os');

require('dotenv').config();
process.env.TZ = 'America/Sao_Paulo';

// Tarefas Cron
const cronController = require('./controllers/CronController');
cronController.scheduleTask();

// API
const api = require('./controllers/ApiController');

const mysql = require('mysql2');
const database = mysql.createConnection(process.env.DATABASE_URL);
console.log('🟢 Mysql - PlanetScale');

if (os.platform() != 'linux') {
    console.log('🔴 Sistema deve ser linux');
    return;
}

// WebServer
if (fs.existsSync(`/etc/letsencrypt/live/${process.env.BASEURL}/privkey.pem`)) {
    const https = useHttps.createServer(
        {
            key: fs.readFileSync(`/etc/letsencrypt/live/${process.env.BASEURL}/privkey.pem`),
            cert: fs.readFileSync(`/etc/letsencrypt/live/${process.env.BASEURL}/fullchain.pem`),
        },
        app
    );
    https.listen(8443, () => {
        console.log('🟢 HTTPS Running - Port 8443');
    });
} else {
    console.log('🔴 HTTPS naõ encontrado certificado');
    process.exit(1);
}

const http = useHttp.createServer(app);
http.listen(8080, () => {
    console.log('🟢 HTTP Running - Port 8080');
});

// Proxy
const proxy = httpProxy.createProxyServer({});
const targets = [];

//console.log('Prefix', process.env.VULTR_SERVER_LABEL_PREFIX);

async function main() {
    try {
        const instancesResponse = await api.instances();
        const instances = instancesResponse.data;
        console.log('instances --->', instances);

        const loadbalanceResponse = await api.loadbalance();
        const loadbalance = loadbalanceResponse.data;
        console.log('loadbalance --->', loadbalance);

        if (instances.length > 0) {
            instances.forEach((instance) => {
                addServer(`http://${instance.internal_ip}`);
            });
        }
    } catch (error) {
        console.error('Ocorreu um erro ao buscar dados da API:', error);
        // Trate o erro de inicialização, se necessário
        process.exit(1); // Encerra o aplicativo com um código de erro
    }
}

main();

// Função para adicionar um servidor à lista de proxy
function addServer(targetUrl) {
    targets.push({ target: targetUrl });
    console.log(`Servidor ${targetUrl} adicionado à lista de proxy.`);
}

// Função para remover um servidor da lista de proxy
function removeServer(targetUrl) {
    const index = targets.findIndex((t) => t.target === targetUrl);
    if (index !== -1) {
        targets.splice(index, 1);
        console.log(`Servidor ${targetUrl} removido da lista de proxy.`);
    }
}

//process.exit(0);
return null;
