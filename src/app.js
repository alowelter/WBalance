const http = require('http');
const https = require('https');
const { createProxyMiddleware } = require('http-proxy-middleware');
const fs = require('fs');
const os = require('os');
const express = require('express');
const { expressCspHeader, INLINE, DATA, EVAL, NONE, BLOB, SELF } = require('express-csp-header');
//const helmet = require('helmet');
const cors = require('cors');
const app = express();

const axios = require('axios');

// Config
require('dotenv').config();
process.env.TZ = 'America/Sao_Paulo';

// Cors
app.use(cors());

// CSP
app.use(
    expressCspHeader({
        directives: {
            'default-src': [SELF, `https://${process.env.BASEURL}`],
            'script-src': [SELF, INLINE, EVAL, `http://${process.env.BASEURL}`, `https://${process.env.BASEURL}`],
            'worker-src': [SELF, BLOB],
            'frame-src': [SELF, BLOB, `https://${process.env.BASEURL}`],
            'img-src': [SELF, DATA, BLOB],
            'connect-src': [SELF, `https://${process.env.BASEURL}`, `wss://${process.env.BASEURL}`],
            'form-action': [SELF, `https://${process.env.BASEURL}`],

            //'style-src': [SELF, INLINE, `https://${process.env.BASEURL}`],
            'block-all-mixed-content': false,
        },
    })
);

/*
app.use(
    helmet.contentSecurityPolicy({
        directives: {
            //defaultSrc: ["'self'"],
            defaultSrc: ["'self'", `https://${process.env.BASEURL}`],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'blob:', `https://${process.env.BASEURL}`],
            workerSrc: ["'self'", 'blob:'],
            frameSrc: ["'self'", 'blob:', `https://${process.env.BASEURL}`],
            imgSrc: ["'self'", 'data:', 'blob:', 'https://*.gravatar.com'],
            connectSrc: ["'self'", `https://${process.env.BASEURL}`, `wss://${process.env.BASEURL}`],
            //formAction: ["'self'", 'https:', `https://${process.env.BASEURL}`],
            formAction: ["'self'", 'https:', 'https://cloudfront.flipay.com.br'],
        },
    })
);
*/

const deploy = require('./controllers/deployController');
const InstancesController = require('./controllers/InstancesController');

// Tarefas Cron
const cronController = require('./controllers/CronController');
cronController.scheduleTask();

// API
const api = require('./controllers/ApiController');
//const mysql = require('mysql2');
//const database = mysql.createConnection(process.env.DATABASE_URL);
//console.log('🟢 Mysql - PlanetScale');

// handles

let instances = [];
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
        if (!instances || instances.length < 1) {
            return null;
        }

        // Round robin
        currIndex = (currIndex + 1) % instances.length;

        // if instace.active not active get another
        if (instances[currIndex].status != 'active') {
            return getServer();
        }
        return instances[currIndex];
    } catch (error) {
        console.log('🔴 Erro ao obtendo instancia.', error, instances);
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
        const loadbalanceResponse = await api.loadbalance();
        loadbalance = loadbalanceResponse.data.instances;
        console.log('🟢 Loadbalance', loadbalance.length);
        serverImprove();
    } catch (error) {
        console.error('Ocorreu um erro ao buscar dados da API:', error);
        // Trate o erro de inicialização, se necessário
        process.exit(1); // Encerra o aplicativo com um código de erro
    }
}

main();

setInterval(async () => {
    await serverImprove();
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
    if (!target) {
        console.log('🔴 Nenhuma instancia encontrada');
        return res.status(500).json({ error: 'Nenhuma instancia encontrada' });
    }

    console.log(`🔸 {${req.method}} > ${req.path} 🔜 ${target.internal_ip}`);
    target.proxy(req, res, next);
});

async function serverImprove() {
    const instancesResponse = await api.instances();
    local_instances = instancesResponse.data.instances;
    const promises = local_instances.map(async (_instance) => {
        let i = null;
        if (instances && instances.length > 0) {
            i = instances.find((instance) => instance.id === _instance.id);
        }
        if (!i) {
            if (_instance.status === 'active') {
                let proxyurl = `http://${_instance.internal_ip}`;
                _instance.proxy = createProxyMiddleware({
                    target: proxyurl,
                    logLevel: 'warn',
                    //onProxyRes: (proxyRes, req, res) => {
                    //    if (proxyRes.headers['content-security-policy']) {
                    //        const currentCSP = proxyRes.headers['content-security-policy'];
                    //        const newCSP = `${currentCSP} script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'`;
                    //        proxyRes.headers['content-security-policy'] = newCSP;
                    //    }
                    //}
                });
                _instance.cpu = 0;
                instances.push(_instance);
            }
        }
        try {
            if (_instance.status === 'active') {
                try {
                    const response = await axios.get(`http://${_instance.internal_ip}/cpu.php`);
                    if (response.status === 200) {
                        const cpuUsageMatch = response.data.match(/CPU:(\d+)%/);
                        if (cpuUsageMatch && cpuUsageMatch[1]) {
                            const cpuUsage = parseInt(cpuUsageMatch[1], 10);
                            _instance.cpu = cpuUsage > 1 ? cpuUsage : 1;
                            console.log(`🔹 ${_instance.internal_ip} > CPU Usage: ${cpuUsage}%`);
                        } else {
                            console.log(`🔹 ${_instance.internal_ip} > CPU Usage not found in response`);
                        }
                    } else {
                        console.log(`🔹 ${_instance.internal_ip} > CPU Usage request failed`);
                    }
                } catch (error) {
                    console.error(`🔹 ${_instance.internal_ip} > Error: ${error.message}`);
                }
            } else {
                _instance.cpu = 0;
            }
        } catch (error) {
            console.error(`🔹 ${_instance.internal_ip} > Error: ${error.message}`);
        }
    });
    await Promise.all(promises);

    let cpuUsageAverage = 0;
    if (instances.length > 1) {
        let cpuUsageSum = 0;
        instances.forEach((instance) => {
            const _instance = local_instances.find((_instance) => _instance.id === instance.id) || null;
            if (!_instance) {
                instance.status = 'deleted';
            } else {
                cpuUsageSum += instance.cpu;
            }
        });
        cpuUsageAverage = cpuUsageSum / instances.length;
    }
    instances = instances.filter((instance) => instance.status != 'deleted');
    if (instances.length === 1) {
        const cpuUsageAverage = instances[0].cpu;
    }
    if (instances.length < 1) {
        console.log('🔴 Nenhuma instancia encontrada - Criando 1');
        InstancesController.Create(req, res, next);
    }
    console.log('🟣 Refresh Instances', instances.length);
    console.log(`🔹 Uso CPU médio: ${cpuUsageAverage}%`);
}
