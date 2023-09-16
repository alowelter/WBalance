// cronController.js
const cron = require('node-cron');

exports.scheduleTask = () => {
    const SegundaFeira_1AM = cron.schedule(
        '0 1 * * 1',
        () => {
            //const SegundaFeira_1AM = cron.schedule('24 13 * * *', () => {
            console.log('⏱️ --[ Tarefa CRON Semanal ]--');
            try {
                DashBoardController.cronCycle(DashBoardController.mailSender);
            } catch (error) {
                console.log('❌ Erro ao executar tarefa CRON Semanal:', error.message);
            }
        },
        {
            scheduled: false,
        }
    );

    console.log('🟢 Crontab');
    //SegundaFeira_1AM.start();
};
