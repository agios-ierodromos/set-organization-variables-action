const core = require('@actions/core');
const io = require('@actions/io');

// most @actions toolkit packages have async methods
async function run() {
    try {
        var fileName = core.getState("fileName");

        io.rmRF(fileName);

        core.setOutput('time', new Date().toTimeString());
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
