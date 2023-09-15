const http = require('http');
const https = require('https');
const httpProxy = require('http-proxy');
const fs = require('fs');
const os = require('os');

require('dotenv').config();
process.env.TZ = 'America/Sao_Paulo';

const mysql = require('mysql2');
const database = mysql.createConnection(process.env.DATABASE_URL);
console.log('🟢 Mysql - PlanetScale');

const proxy = httpProxy.createProxyServer({});
const targets = [];

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
