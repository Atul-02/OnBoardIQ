// RESUBMISSION_REQUESTED older than the window (7 days) -> CLOSED_EXPIRED.
const cron = require('node-cron');
const { EXPIRY_CRON } = require('../config');
const { expireResubmissions } = require('../services/workflow');

function startExpiryJob() {
  const task = cron.schedule(EXPIRY_CRON, async () => {
    try {
      const closed = await expireResubmissions();
      if (closed) console.log(`[expiry job] closed ${closed} application(s)`);
    } catch (err) {
      console.error('[expiry job] failed:', err.message);
    }
  });
  console.log(`Expiry job scheduled (${EXPIRY_CRON})`);
  return task;
}

module.exports = { startExpiryJob };
