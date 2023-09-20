const http = require('http');
const https = require('https');
const { createProxyMiddleware } = require('http-proxy-middleware');
const fs = require('fs');
const os = require('os');
const express = require('express');
const cors = require('cors');
const app = express();

const axios = require('axios');

// Config
require('dotenv').config();
process.env.TZ = 'America/Sao_Paulo';

// Cors
app.use(cors());

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
let instancesPrepare = [];
let loadbalance = null;
// registrador para evitar overload de criação e destruição de instancias
let poolInStancesRefreshTime = Date.now();

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
}, 30 * 1000); // 1 minuto

app.get('/ping', (req, res) => {
    console.log(`🔹 ping`);
    return res.send('pong');
});

const util = require('util');
const exec = util.promisify(require('child_process').exec);
const osutils = require('os-utils');
function getCpuUsage() {
    return new Promise((resolve, reject) => {
        osutils.cpuUsage((value) => {
            resolve(value.toFixed(2) * 100);
        });
    });
}

app.get('/cpu', async (req, res) => {
    const { exec } = require('child_process');
    let result = {
        loadbalance: {},
        backend: {
            webserver: [],
            media_cpu: 0,
        },
    };

    try {
        result.loadbalance.cpu = await getCpuUsage();
        let media_cpu = 0;
        instances.forEach((instance) => {
            result.backend.webserver.push({ ip: instance.internal_ip, cpu: instance.cpu });
            media_cpu += instance.cpu;
        });
        result.backend.media_cpu = (media_cpu / instances.length).toFixed(2);

        return res.status(200).json(result);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'An error occurred' });
    }
});

// Auto-deploy
app.get('/deploy', async (req, res, next) => {
    deploy.run(req, res, next);
});
app.post('/deploy', async (req, res, next) => {
    deploy.run(req, res, next);
});
app.get('/add-instance', async (req, res, next) => {
    return await InstancesController.Create(req, res, next);
});

app.use(async (req, res, next) => {
    const target = getServer();
    if (!target) {
        console.log('🔴 Nenhuma instancia encontrada');
        return res.status(500).json({ error: 'Nenhuma instancia encontrada' });
    }

    if (process.env.LOG_MODE.toUpperCase() == 'DEBUG') console.log(`🔸 {${req.method}} > ${req.path} 🔜 ${target.internal_ip}`);
    if (target) target.proxy(req, res, next);
});

async function serverImprove() {
    try {
        instancesPrepare = [];
        const response = await api.instances();

        if (response.status !== 200) return;

        const _instances = response.data.instances;

        if (_instances.length < 1) {
            console.log('🔴 Nenhuma instancia encontrada - Criando 1');
            InstancesController.Create();
            return;
        }

        const updateInstances = async (_instance) => {
            if (_instance.status !== 'active') {
                instancesPrepare.push(_instance);
                return null;
            }

            const found = instances.find((instance) => instance.id === _instance.id);

            if (!found) {
                _instance.cpu = await api.Cpu(_instance);
                if (_instance.cpu >= 0) {
                    _instance.proxy = createProxyMiddleware({
                        target: `https://${_instance.internal_ip}/`,
                        logLevel: 'warn',
                        onProxyRes: (proxyRes, req, res) => {
                            proxyRes.headers['Server'] = 'WBalance by Welm 09/2023 ';
                        },
                    });
                    return _instance;
                } else {
                    instancesPrepare.push(_instance);
                }
            }
            return null;
        };

        const newInstances = await Promise.all(_instances.map(updateInstances));
        instances = [...instances, ...newInstances.filter(Boolean)];

        // Remover instâncias fantasmas
        instances = instances.filter((instance) => {
            return _instances.some((_instance) => _instance.id === instance.id);
        });

        // Atualizar uso da CPU e remover instâncias inválidas
        const updateCpuUsage = async (instance) => {
            instance.cpu = await api.Cpu(instance);
            return instance.cpu >= 0 ? instance : null;
        };

        instances = await Promise.all(instances.map(updateCpuUsage)).then((results) => results.filter(Boolean));

        // Cálculo da CPU
        const cpuUsageSum = instances.reduce((sum, instance) => sum + instance.cpu, 0);
        const cpuUsageAverage = Math.round(cpuUsageSum / instances.length);
        const lbcpu = await getCpuUsage();

        console.log(`🔹[local cpu: ${lbcpu}] - [Instances: ${instances.length}] - [cpu total: ${cpuUsageAverage}%] - [Criando: ${instancesPrepare.length}]`);

        // Lógica para criar ou destruir instâncias baseada no uso da CPU
        const currentTime = Date.now();
        if (!poolInStancesRefreshTime || currentTime - poolInStancesRefreshTime >= 1 * 60 * 1000) {
            if (cpuUsageAverage >= 80 && instances.length < process.env.INSTANCES_MAX && instancesPrepare.length <= 0) {
                InstancesController.Create();
                console.log('🔵 Criando instancia');
            } else if (cpuUsageAverage < 40 && instances.length > process.env.INSTANCES_MIN) {
                const lastInstance = instances.pop();
                InstancesController.Destroy(lastInstance.id);
                console.log('🔴 Excluindo instancia');
            }
            poolInStancesRefreshTime = Date.now();
        }
    } catch (error) {
        console.error(error);
    }
}

async function _serverImprove() {
    try {
        const response = await api.instances();

        if (response.status !== 200) return;

        const _instances = response.data.instances;

        if (_instances.length < 1) {
            console.log('🔴 Nenhuma instancia encontrada - Criando 1');
            InstancesController.Create();
            return;
        }

        const updateInstances = async (_instance) => {
            if (_instance.status !== 'active') return null;

            const found = instances.find((instance) => instance.id === _instance.id);

            if (!found) {
                _instance.cpu = await api.Cpu(_instance);

                if (_instance.cpu >= 0) {
                    _instance.proxy = createProxyMiddleware({
                        target: `https://${_instance.internal_ip}/`,
                        logLevel: 'warn',
                        onProxyRes: (proxyRes, req, res) => {
                            proxyRes.headers['Server'] = 'WBalance by Welm 09/2023 ';
                        },
                    });
                    return _instance;
                }
            }
            return null;
        };

        const newInstances = await Promise.all(_instances.map(updateInstances));
        instances = [...instances, ...newInstances.filter(Boolean)];

        // Remover instâncias fantasmas
        instances = instances.filter((instance) => {
            return _instances.some((_instance) => _instance.id === instance.id);
        });

        // Atualizar uso da CPU e remover instâncias inválidas
        const updateCpuUsage = async (instance) => {
            instance.cpu = await api.Cpu(instance);
            return instance.cpu >= 0 ? instance : null;
        };

        instances = await Promise.all(instances.map(updateCpuUsage)).then((results) => results.filter(Boolean));

        // Cálculo da CPU
        const cpuUsageSum = instances.reduce((sum, instance) => sum + instance.cpu, 0);
        const cpuUsageAverage = Math.round(cpuUsageSum / instances.length);

        // Lógica para criar ou destruir instâncias baseada no uso da CPU
        if (cpuUsageAverage >= 80 && instances.length < process.env.INSTANCES_MAX) {
            InstancesController.Create();
        } else if (cpuUsageAverage < 40 && instances.length > process.env.INSTANCES_MIN) {
            const lastInstance = instances.pop();
            InstancesController.Destroy(lastInstance.id);
        }
    } catch (error) {
        console.error(error);
    }
}
