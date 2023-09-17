const useHttp = require('http');
const useHttps = require('https');
const useProxy = require('http-proxy');
const fs = require('fs');
const os = require('os');
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
    const https = useHttps.createServer(
        {
            key: fs.readFileSync(`/etc/letsencrypt/live/${process.env.BASEURL}/privkey.pem`),
            cert: fs.readFileSync(`/etc/letsencrypt/live/${process.env.BASEURL}/fullchain.pem`),
        },
        app
    );
    https.listen(443, () => {
        console.log('🟢 HTTPS Running - Port 8443');
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

const http = useHttp.createServer(app);
http.listen(3001, () => {
    console.log('🟢 HTTP Running - Port 8080');
});

// Proxy
const proxy = useProxy.createProxyServer({});
const targets = [];

app.use(async (req, res, next) => {
    if (instances.length <= 0) {
        res.status(500).send('Nenhum servidor disponível');
        return;
    }
    console.log('instance ', instances[0]);

    //proxy.web(req, res, { target: 'http://localhost:3001' }, (err) => {
});

async function main() {
    try {
        const instancesResponse = await api.instances();
        instances = instancesResponse.data;
        console.log('instances --->', instances);

        const loadbalanceResponse = await api.loadbalance();
        loadbalance = loadbalanceResponse.data;
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
