const api = require('./ApiController');

exports.Instances = async (req, res) => {
    api.Get('/instances')
        .then((response) => {
            res.json(response.data);
        })
        .catch((error) => {
            res.json(error);
        });
};

exports.LoadBalance = async (req, res) => {
    api.Get('/instances')
        .then((response) => {
            res.json(response.data);
        })
        .catch((error) => {
            res.json(error);
        });
};
