import chalk from 'chalk';
import { TelemetryTransportParams } from '../../types/telemetry.types';
import logger from '../../utils/logger';
import { BaseTelemetryTransport } from '../TelemetryTransport';
export class ProcessTelemetryTransport implements BaseTelemetryTransport {
  send(payload: TelemetryTransportParams): Promise<void> {
    if (typeof window !== 'undefined') {
      return Promise.reject(
        new Error('ProcessTelemetryTransport can only be used in Node.js environments')
      );
    }

    return new Promise(resolve => {
      try {
        // use fetch to send the telemetry

        const url = new URL(payload.url);
        const protocol = url.protocol === 'https:' ? 'https' : 'http';
        const port = url.port || (url.protocol === 'https:' ? 443 : 80);

        const args = [
          '-e',
          `
                    const http = require('${protocol}');
                    const options = {
                        hostname: '${url.hostname}',
                        path: '${url.pathname}${url.search}',
                        port: ${port},
                        method: '${payload.method}',
                        headers: ${JSON.stringify(payload.headers)}
                    };

                    const req = http.request(options, (res) => {
                        res.on('data', () => {});
                        res.on('end', () => {
                            process.exit(0);
                        });
                    });

                    req.on('error', () => {
                        process.exit(0);
                    });

                    req.write(JSON.stringify(${JSON.stringify(payload.data)}));
                    req.end();
                    `,
        ];

        import('child_process')
          .then(({ spawn }) => {
            spawn('node', args, {
              stdio: 'ignore',
              detached: false,
              shell: false,
            }).unref();
            resolve();
          })
          .catch(error => {
            logger.error('Error sending telemetry', error);
            resolve();
          });
        logger.debug(chalk.yellow('Process Telemetry'), JSON.stringify(payload, null, 2));
      } catch (error) {
        logger.error('Error sending telemetry', error);
        resolve();
      }
    });
  }
}
