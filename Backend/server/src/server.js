const { PORT, EXTRACTION_PROVIDER } = require('./config');
const { connectDb } = require('./db');
const { createApp } = require('./app');
const { startExpiryJob } = require('./jobs/expireResubmissions');

async function main() {
  await connectDb();
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`OnboardIQ API on http://localhost:${PORT}  (docs: /api-docs, extraction provider: ${EXTRACTION_PROVIDER})`);
  });
  startExpiryJob();
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
