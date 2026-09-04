const path = require('path');
const { execFile } = require('child_process');
const { expect } = require('chai');

const SMOKE_SCRIPT = path.join(__dirname, 'sentry.smoke.js');

function runSmokeScript() {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [SMOKE_SCRIPT], { timeout: 20000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`sentry smoke script failed: ${error.message}\n${stderr}`));
        return;
      }
      resolve(JSON.parse(stdout));
    });
  });
}

describe('sentry service', function sentryService() {
  this.timeout(30000);

  it('should only report unexpected errors to Sentry, not expected client errors', async () => {
    const { statuses, captured } = await runSmokeScript();
    // the error middleware still answers every request
    expect(statuses).to.deep.equal({
      '/validation-error': 422,
      '/unauthorized': 401,
      '/not-found': 404,
      '/unexpected': 500,
    });
    // only the unexpected error reached Sentry
    expect(captured).to.deep.equal(['unexpected boom']);
  });
});
