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
    https.listen(443, () => {
        console.log('🟢 HTTPS Running - Port 443');
    });
} else {
    console.log('🔴 HTTPS naõ encontrado certificado');
    process.exit(1);
}

const http = useHttp.createServer(app);
http.listen(80, () => {
    console.log('🟢 HTTP Running - Port 80');
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

const http = useHttp.createServer(app);
http.listen(8080, () => {
    console.log('🟢 HTTP Running - Port 80');
});

const httpsOptions = {
    key: fs.readFileSync('seu_certificado.key'), // Substitua com o caminho para sua chave privada
    cert: fs.readFileSync('seu_certificado.crt'), // Substitua com o caminho para seu certificado SSL/TLS
};

const server = http.createServer((req, res) => {
    if (targets.length === 0) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Nenhum servidor de destino disponível.');
        return;
    }

    const target = targets[Math.floor(Math.random() * targets.length)];
    proxy.web(req, res, target);
});

const httpsServer = https.createServer(httpsOptions, (req, res) => {
    if (targets.length === 0) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Nenhum servidor de destino disponível.');
        return;
    }

    const target = targets[Math.floor(Math.random() * targets.length)];
    proxy.web(req, res, target);
});

server.listen(PORT, () => {
    console.log(`Servidor HTTP de balanceamento de carga rodando na porta ${PORT}`);
});

httpsServer.listen(HTTPS_PORT, () => {
    console.log(`Servidor HTTPS de balanceamento de carga rodando na porta ${HTTPS_PORT}`);
});

// Exemplos de uso das funções
addServer('http://localhost:3001');
addServer('http://localhost:3002');

// Remova um servidor após algum tempo (por exemplo, 30 segundos)
setTimeout(() => {
    removeServer('http://localhost:3001');
}, 30000);
