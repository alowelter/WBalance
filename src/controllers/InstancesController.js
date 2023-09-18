const api = require('./ApiController');

module.Instances = async (req, res) => {
    api.Get('/instances')
        .then((response) => {
            res.json(response.data);
        })
        .catch((error) => {
            res.json(error);
        });
};

module.Loadbalance = async (req, res) => {
    api.Get('/instances')
        .then((response) => {
            res.json(response.data);
        })
        .catch((error) => {
            res.json(error);
        });
};
