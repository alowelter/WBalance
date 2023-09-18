const api = require('./ApiController');

exports.Instances = async () => {
    let response = api.Get('/instances');
    return response.data.instances;
};

exports.LoadBalance = async (req, res) => {
    let response = api.Get('/instances');
    return response.data.instances;
};
