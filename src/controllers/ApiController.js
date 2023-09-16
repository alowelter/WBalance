const axios = require('axios');
require('dotenv').config();

exports.instances = async (req, res) => {
    return await axios.get('https://api.vultr.com/v2/instances', {
        headers: {
            Authorization: `Bearer ${process.env.VULTR_API_KEY}`,
        },
    });
};
