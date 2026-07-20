const buildInfo = require('../build-info.json');

function formatBuildInfo() {
    return `${buildInfo.name} | ${buildInfo.buildId}`;
}

module.exports = {
    buildInfo: Object.freeze({ ...buildInfo }),
    formatBuildInfo,
};
