// PM2 configuration for TillSync SaaS Landing Page
// Development environment configuration

module.exports = {
  apps: [
    {
      name: 'tillsync-saas',
      script: 'npx',
      args: 'wrangler pages dev dist --d1=tillsync-saas-production --local --ip 0.0.0.0 --port 4000',
      env: {
        NODE_ENV: 'development',
        PORT: 4000,
        JWT_SECRET: 'development-secret-key-change-in-production'
      },
      watch: false, // Disable PM2 file monitoring (wrangler handles this)
      instances: 1, // Development mode uses only one instance
      exec_mode: 'fork',
      restart_delay: 3000,
      max_restarts: 10
    }
  ]
}