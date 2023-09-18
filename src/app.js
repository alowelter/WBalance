const http = require('http');
const https = require('https');
const { createProxyMiddleware } = require('http-proxy-middleware');
const fs = require('fs');
const os = require('os');
const express = require('express');
const helmet = require('helmet');
const app = express();
app.use(helmet());
const axios = require('axios');

require('dotenv').config();
process.env.TZ = 'America/Sao_Paulo';

const deploy = require('./controllers/deployController');
const InstancesController = require('./controllers/InstancesController');

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
        process.exit(0);
    });
}

http.createServer(app).listen(3001, () => {
    console.log('🟢 HTTP Running - Port 3001');
});

// -----------------------------------------------------
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

        // if instace.active not active get another
        if (instances[currIndex].status != 'active') {
            return getServer();
        }

        const target = instances[currIndex];
        return `http://${target.internal_ip}/`;
    } catch (error) {
        console.log('🔴 Erro ao obtendo instancia.', error);
        return null;
    }
}

const proxyLog = (proxyServer, options) => {
    proxyServer.on('proxyReq', (proxyReq, req, res) => {
        console.log(`🔹 [proxy] [${req.method}] ${req.url}`);
    });
};

async function main() {
    try {
        const instancesResponse = await api.instances();
        instances = instancesResponse.data.instances;
        console.log('🟢 Instances', instances.length);
        if (instances.length < 1) {
            console.log('🔴 Nenhuma instancia encontrada - Criando 1');
            InstancesController.Create(req, res, next);
        }
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

setInterval(async () => {
    const instancesResponse = await api.instances();
    instances = instancesResponse.data.instances;
    console.log('🟣 Refresh Instances', instances.length);

    const promises = instances.map(async (instance) => {
        try {
            // Faça uma solicitação HTTP para obter o uso de CPU de cada instância
            const response = await axios.get(`http://${instance.internal_ip}/cpu.php`);

            // Verifique se a resposta foi bem-sucedida
            if (response.status === 200) {
                // Use uma expressão regular para extrair a porcentagem de uso da CPU
                const cpuUsageMatch = response.data.match(/CPU:(\d+)%/);
                if (cpuUsageMatch && cpuUsageMatch[1]) {
                    const cpuUsage = parseInt(cpuUsageMatch[1], 10);
                    // Adicione a propriedade 'cpu' ao objeto da instância com o percentual de uso
                    instance.cpu = cpuUsage;
                    console.log(`🔹 ${instance.internal_ip} > CPU Usage: ${cpuUsage}%`);
                } else {
                    console.log(`🔹 ${instance.internal_ip} > CPU Usage not found in response`);
                }
            } else {
                console.log(`🔹 ${instance.internal_ip} > CPU Usage request failed`);
            }
        } catch (error) {
            console.error(`🔹 ${instance.internal_ip} > Error: ${error.message}`);
        }
    });

    await Promise.all(promises);
}, 60 * 1000); // 1 minuto

app.get('/ping', (req, res) => {
    console.log(`🔹 ping`);
    return res.send('pong');
});

// Auto-deploy
app.get('/deploy', async (req, res, next) => {
    deploy.run(req, res, next);
});
app.post('/deploy', async (req, res, next) => {
    deploy.run(req, res, next);
});
app.get('/add-instance', async (req, res, next) => {
    await InstancesController.Create(req, res, next);
    const instancesResponse = await api.instances();
    instances = instancesResponse.data.instances;
});

app.use(async (req, res, next) => {
    const target = getServer();
    const proxy = createProxyMiddleware({
        target: target,
        changeOrigin: false,
        plugins: [proxyLog],
        logLevel: 'warn',
    });
    console.log(`🔸 {${req.method}} > ${req.path} 🔜 ${target}`);

    proxy(req, res, next);
});
