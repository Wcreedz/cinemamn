// PM2 тохиргоо. Эхлүүлэх: pm2 start ecosystem.config.cjs
// Орчны хувьсагчийг төслийн .env-ээс Node өөрөө уншина.
const path = require('path');

const ENV_FILE = path.join(__dirname, '.env');
const backend = path.join(__dirname, 'backend');
const frontend = path.join(__dirname, 'frontend');
const logs = path.join(__dirname, 'logs');

const common = {
  node_args: `--env-file=${ENV_FILE}`,
  // --env-file одоо байгаа утгыг дарж бичдэггүй тул .env-д development үлдсэн ч PM2 дээр
  // төлбөрийн симулятор, mock SMS хэзээ ч нээгдэхгүй.
  env: { NODE_ENV: 'production' },
  instances: 1,
  exec_mode: 'fork',
  // Тохиргооны алдаатай үед секундэд олон удаа дахин асахгүй.
  exp_backoff_restart_delay: 1000,
  time: true,
};

module.exports = {
  apps: [
    {
      ...common,
      name: 'mongolflix-api',
      cwd: backend,
      script: 'dist/server.js',
      // Rate limit болон тохиргооны кэш процесс дотор байдаг тул нэг instance.
      max_memory_restart: '1G',
      error_file: path.join(logs, 'api.err.log'),
      out_file: path.join(logs, 'api.out.log'),
    },
    {
      ...common,
      name: 'mongolflix-worker',
      cwd: backend,
      script: 'dist/jobs/worker.js',
      // Ажиллаж буй FFmpeg ажлыг гэнэт тасалж, буцаан дараалалд оруулахгүйн тулд хүлээнэ.
      kill_timeout: 60_000,
      error_file: path.join(logs, 'worker.err.log'),
      out_file: path.join(logs, 'worker.out.log'),
    },
    {
      ...common,
      name: 'mongolflix-web',
      cwd: frontend,
      script: path.join(__dirname, 'node_modules/next/dist/bin/next'),
      args: 'start -p 3110 -H 127.0.0.1',
      max_memory_restart: '1G',
      error_file: path.join(logs, 'web.err.log'),
      out_file: path.join(logs, 'web.out.log'),
    },
  ],
};
