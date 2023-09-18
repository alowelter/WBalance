const http = require('http');
const https = require('https');
const proxy = require('http-proxy-middleware');
const fs = require('fs');
const os = require('os');
const express = require('express');
const helmet = require('helmet');
const app = express();
app.use(helmet());

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

// handles
let instances = null;
let loadbalance = null;
if (os.platform() != 'linux') {
    console.log('🔴 Sistema deve ser linux');
    return;
}

// WebServer
if (fs.existsSync(`/etc/letsencrypt/live/${process.env.BASEURL}/privkey.pem`)) {
    const options = {
        key: fs.readFileSync(`/etc/letsencrypt/live/${process.env.BASEURL}/privkey.pem`),
        cert: fs.readFileSync(`/etc/letsencrypt/live/${process.env.BASEURL}/fullchain.pem`),
    };
    https.createServer(options, app).listen(443, () => {
        console.log('🟢 HTTPS Running - Port 443');
    });
} else {
    console.log('🔴 HTTPS - Não encontrado certificado');
    console.log('🟡 tentando gerar');
    const { exec } = require('child_process');
    const comandoCertbot = `certbot certonly --standalone --email marcelo@alolwelter.com.br --agree-tos -d ${process.env.BASEURL}`;
    exec(comandoCertbot, (error, stdout, stderr) => {
        if (error) {
            console.error(`Erro ao executar o comando: ${error}`);
            process.exit(1);
        }
        console.log(`🔶 Resultado: ${stdout}`);
        console.error(`🔴 Erros do comando: ${stderr}`);
    });
    process.exit(1);
}

http.createServer(app).listen(3001, () => {
    console.log('🟢 HTTP Running - Port 3001');
});

// Proxy
const proxyOptions = {
    target: '',
    changeOrigin: true,
    onProxyReq: (proxyReq, req) => {
        // Add custom header to request
        proxyReq.setHeader('X-Special-Proxy-Header', 'WBalance');
    },
    logLevel: 'debug',
};

// Next server index
let currIndex = 0;

// Get next server
function getServer() {
    try {
        // Round robin
        currIndex = (currIndex + 1) % instances.length;

        return instances[currIndex];
    } catch (error) {
        console.log('🔴 Erro ao obtendo instancia.', error);
        return {};
    }
}

/*
// Proxy requests
router.all('*', (req, res) => {
    // Get next target server
    const target = getServer();
    proxyOptions.target = `http://${target.internal_ip}`;

    // Forward request
    proxy(proxyOptions)(req, res);
});
*/

async function main() {
    try {
        const instancesResponse = await api.instances();
        instances = instancesResponse.data.instances;
        console.log('🟢 Instances', instances.length);

        const loadbalanceResponse = await api.loadbalance();
        loadbalance = loadbalanceResponse.data.instances;
        console.log('🟢 Loadbalance', loadbalance.length);
    } catch (error) {
        console.error('Ocorreu um erro ao buscar dados da API:', error);
        // Trate o erro de inicialização, se necessário
        process.exit(1); // Encerra o aplicativo com um código de erro
    }
}

main();

app.get('/ping', (req, res) => {
    return res.send('pong');
});

app.use(async (req, res, next) => {
    const currentTime = new Date().toLocaleTimeString().slice(0, 8);
    console.log(`🔸 ${currentTime} │ {${req.method}} -> ${req.path}`);

    const target = getServer();
    proxyOptions.target = `http://${target.internal_ip}`;

    // Forward request
    proxy(proxyOptions)(req, res);
});
