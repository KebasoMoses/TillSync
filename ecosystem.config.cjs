// PM2 configuration for M-Pesa Reconciliation System
// Development environment configuration

module.exports = {
  apps: [
    {
      name: 'tillsync'
      script: 'npx',
      args: 'wrangler pages dev dist --d1=tillsync-production --local --ip 0.0.0.0 --port 3000',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      watch: false, // Disable PM2 file monitoring (wrangler handles this)
      instances: 1, // Development mode uses only one instance
      exec_mode: 'fork',
      restart_delay: 3000,
      max_restarts: 10
    }
  ]
}