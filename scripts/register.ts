import { parseArgs } from 'node:util';
import { adminRequest } from './admin-request.ts';

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    webhook: { type: 'string' },
  },
});

if (!values.name) {
  console.error('Uso: npm run register -- --name "Seu Nome" [--webhook https://xxxx.ngrok.app]');
  process.exit(1);
}

await adminRequest('/admin/register', { name: values.name, webhook: values.webhook });
