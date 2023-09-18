const api = require('./ApiController');

exports.Instances = () => {
    return api.instances();
};

exports.LoadBalance = (req, res) => {
    return api.loadbalance();
};
