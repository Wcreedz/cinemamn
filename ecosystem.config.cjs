// PM2 тохиргоо. Эхлүүлэх: pm2 start ecosystem.config.cjs
// Орчны хувьсагчийг төслийн .env-ээс Node өөрөө уншина.
const path = require('path');

const ENV_FILE = path.join(__dirname, '.env');
const backend = path.join(__dirname, 'backend');
const frontend = path.join(__dirname, 'frontend');
const logs = path.join(__dirname, 'logs');

module.exports = {
  apps: [
    {
      name: 'mongolflix-api',
      cwd: backend,
      script: 'dist/server.js',
      node_args: `--env-file=${ENV_FILE}`,
      // Rate limit болон тохиргооны кэш процесс дотор байдаг тул нэг instance.
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      error_file: path.join(logs, 'api.err.log'),
      out_file: path.join(logs, 'api.out.log'),
      time: true,
    },
    {
      name: 'mongolflix-worker',
      cwd: backend,
      script: 'dist/jobs/worker.js',
      node_args: `--env-file=${ENV_FILE}`,
      instances: 1,
      exec_mode: 'fork',
      // Ажиллаж буй FFmpeg ажлыг гэнэт тасалж, буцаан дараалалд оруулахгүйн тулд хүлээнэ.
      kill_timeout: 60_000,
      error_file: path.join(logs, 'worker.err.log'),
      out_file: path.join(logs, 'worker.out.log'),
      time: true,
    },
    {
      name: 'mongolflix-web',
      cwd: frontend,
      script: path.join(__dirname, 'node_modules/next/dist/bin/next'),
      args: 'start -p 3100 -H 127.0.0.1',
      node_args: `--env-file=${ENV_FILE}`,
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      error_file: path.join(logs, 'web.err.log'),
      out_file: path.join(logs, 'web.out.log'),
      time: true,
    },
  ],
};
