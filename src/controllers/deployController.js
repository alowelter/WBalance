exports.run = async function (req, res, next) {
    var exec = require('child_process').exec;
    try {
        console.log('🔷 Deploying...');
        exec('git pull', (error, stdout, stderr) => {
            if (error) {
                console.log(error);
            } else {
                console.log(stdout);
            }
            console.log('🔶 Done...');
        });
    } catch (error) {
        console.log(error);
    }
    res.send('Deployed...');
};
