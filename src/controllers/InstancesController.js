const api = require('./ApiController');

exports.Instances = async () => {
    api.Get('/instances')
        .then((response) => {
            return response.data;
        })
        .catch((error) => {
            return error;
        });
};

exports.LoadBalance = async (req, res) => {
    api.Get('/instances')
        .then((response) => {
            return response.data;
        })
        .catch((error) => {
            return error;
        });
};
