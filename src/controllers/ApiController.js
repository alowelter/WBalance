const axios = require('axios');
const snmp = require('net-snmp');

require('dotenv').config();

exports.Get = async (url) => {
    return await axios.get(`https://api.vultr.com/v2${url}`, {
        headers: {
            Authorization: `Bearer ${process.env.VULTR_API_KEY}`,
        },
    });
};
exports.Post = async (url, data) => {
    return await axios.post(`https://api.vultr.com/v2${url}`, data, {
        headers: {
            Authorization: `Bearer ${process.env.VULTR_API_KEY}`,
        },
    });
};
exports.Delete = async (url) => {
    return await axios.delete(`https://api.vultr.com/v2${url}`, {
        headers: {
            Authorization: `Bearer ${process.env.VULTR_API_KEY}`,
        },
    });
};

exports.instances = async (req, res) => {
    return await axios.get(`https://api.vultr.com/v2/instances?label=${process.env.VULTR_SERVER_LABEL_PREFIX}_webserver`, {
        headers: {
            Authorization: `Bearer ${process.env.VULTR_API_KEY}`,
        },
    });
};

exports.loadbalance = async (req, res) => {
    return await axios.get(`https://api.vultr.com/v2/instances?label=${process.env.VULTR_SERVER_LABEL_PREFIX}_loadbalance`, {
        headers: {
            Authorization: `Bearer ${process.env.VULTR_API_KEY}`,
        },
    });
};

exports.GetCpu = async (instance) => {
    return new Promise((resolve, reject) => {
        try {
            const cpuIdle = '1.3.6.1.4.1.2021.11.11.0'; // CPU Idle Time
            const session = snmp.createSession(instance.internal_ip, 'wbalance');
            session.get([cpuIdle], function (error, varbinds) {
                if (error) {
                    console.log('⭕', instance.internal_ip, '[Inicializando]');
                    resolve(-1);
                } else {
                    const oidCpu = varbinds.find((varbind) => varbind.oid === cpuIdle);
                    const cpuUsage = 100 - oidCpu.value;
                    resolve(cpuUsage);
                }
                session.close();
            });
        } catch (error) {
            console.log('⭕', instance.internal_ip, '[Inicializando]');
            resolve(-1);
        }
    });
};
