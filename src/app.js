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
    console.log('🔴 Sistema Operacional não suportado');
    return;
}

api.instances()
    .then((response) => {
        let sql = `INSERT INTO LB_server (instanceID, tipo, ip) VALUES (?, 'Balance', ?) ON DUPLICATE KEY UPDATE ip = VALUES(ip)`;
        console.log('Resposta da API da Vultr:');
        console.log(response.data);
        response.data.instances.forEach((instance) => {
            if (instance.tags.includes('Balance')) {
                console.log('🟢 Balanceador de Carga encontrado');
                database.query(sql, [instance.id, instance.internal_ip], (err, results) => {
                    if (err) {
                        console.log('🔴 Erro ao inserir ou atualizar o registro na tabela LB_server');
                        console.log(err);
                        return;
                    }
                    console.log('🟢 Registro inserido ou atualizado na tabela LB_server');
                });
            }
        });
    })
    .catch((error) => {
        console.error('Erro ao consultar a API da Vultr:', error);
    });

return null;

const proxy = httpProxy.createProxyServer({});
const targets = [];

if (fs.existsSync(`/etc/letsencrypt/live/${process.env.BASEURL}/privkey.pem`)) {
    const https = useHttps.createServer(
        {
            key: fs.readFileSync(`/etc/letsencrypt/live/${process.env.BASEURL}/privkey.pem`),
            cert: fs.readFileSync(`/etc/letsencrypt/live/${process.env.BASEURL}/fullchain.pem`),
        },
        app
    );

    https.listen(8443, () => {
        console.log('🟢 HTTPS Running - Port 443');
    });
} else {
    console.log('🔴 HTTPS naõ encontrado certificado');
}

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

const PORT = 8080;
const HTTPS_PORT = 8443;

server.listen(PORT, () => {
    console.log(`Servidor HTTP de balanceamento de carga rodando na porta ${PORT}`);
});

httpsServer.listen(HTTPS_PORT, () => {
    console.log(`Servidor HTTPS de balanceamento de carga rodando na porta ${HTTPS_PORT}`);
});

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

// Exemplos de uso das funções
addServer('http://localhost:3001');
addServer('http://localhost:3002');

// Remova um servidor após algum tempo (por exemplo, 30 segundos)
setTimeout(() => {
    removeServer('http://localhost:3001');
}, 30000);
