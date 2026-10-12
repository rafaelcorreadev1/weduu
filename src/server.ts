import { loadConfig } from './config.ts';
import { createLogger } from './logger.ts';
import { CredentialStore } from './platform/credentials.ts';
import { createService } from './service.ts';

const config = loadConfig();
const logger = createLogger({ level: config.logLevel });

const credentials = new CredentialStore({ file: config.credentialsFile });
const loaded = await credentials.load();
logger.info({ cid: loaded?.cid ?? null }, loaded ? 'credentials loaded' : 'not registered yet');

if (!config.adminKey) {
  logger.warn('ADMIN_KEY not set: /admin routes are disabled');
}

const service = createService({ config, logger, credentials });
service.start();

const server = service.app.listen(config.port, () => {
  logger.info({ port: config.port }, 'server listening');
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, 'shutting down');
  service.stop();
  server.close((err) => {
    if (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
    process.exit(0);
  });
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
