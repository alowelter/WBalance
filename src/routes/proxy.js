const express = require('express');
const proxy = require('http-proxy-middleware');

const router = express.Router();

const servers = [
    {
        host: 'localhost',
        port: 3000,
        weight: 1,
    },
    // Add more servers here
];

// Proxy middleware configuration
const proxyOptions = {
    target: '',
    changeOrigin: true,
    onProxyReq: (proxyReq, req) => {
        // Add custom header to request
        proxyReq.setHeader('X-Special-Proxy-Header', 'foobar');
    },
    logLevel: 'debug',
};

// Next server index
let currIndex = 0;

// Get next server
function getServer() {
    // Round robin
    currIndex = (currIndex + 1) % servers.length;

    return servers[currIndex];
}

// Proxy requests
router.all('*', (req, res) => {
    // Get next target server
    const target = getServer();
    proxyOptions.target = `http://${target.host}:${target.port}`;

    // Forward request
    proxy(proxyOptions)(req, res);
});

module.exports = router;
