const axios = require('axios');
require('dotenv').config();

exports.instances = async (req, res) => {
    return axios.get('https://api.vultr.com/v2/blocks', {
        headers: {
            Authorization: `Bearer ${process.env.VULTR_API_KEY}`,
        },
    });
};
